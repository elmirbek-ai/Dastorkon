from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.menu.models import Category, MenuItem
from apps.orders.models import Order
from apps.orders.services import add_cart_item, assign_waiter_to_table_session
from apps.restaurants.models import Restaurant
from apps.tables.models import RestaurantTable
from apps.tables.services import (
    create_customer_session,
    get_or_create_active_table_session,
)
from apps.users.models import User, WaiterShift


class OrderTotalConsistencyApiTests(APITestCase):
    def setUp(self):
        self.waiter = User.objects.create_user(
            username="total-waiter",
            role=User.Role.WAITER,
        )
        self.kitchen = User.objects.create_user(
            username="total-kitchen",
            role=User.Role.KITCHEN,
        )
        self.admin = User.objects.create_user(
            username="total-admin",
            role=User.Role.ADMIN,
        )
        WaiterShift.objects.create(waiter=self.waiter)
        self.restaurant = Restaurant.objects.create(name="Totals restaurant")
        self.category = Category.objects.create(
            restaurant=self.restaurant,
            name_ky="Негизги тамактар",
            name_ru="Основные блюда",
        )
        self.menu_item = MenuItem.objects.create(
            restaurant=self.restaurant,
            category=self.category,
            name_ky="Палоо",
            name_ru="Плов",
            price=Decimal("100.00"),
        )
        self.table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=1,
        )
        self.table_session = get_or_create_active_table_session(self.table)
        self.table_session = assign_waiter_to_table_session(
            self.table_session,
            self.waiter,
        )
        self.customer_session = create_customer_session(self.table_session)
        self.customer_client = APIClient()
        self.customer_client.cookies["customer_session_key"] = str(
            self.customer_session.session_key
        )
        self.orders_url = reverse(
            "public-orders",
            args=(self.table.qr_token,),
        )
        self.cart_url = reverse(
            "public-cart",
            args=(self.table.qr_token,),
        )

    @staticmethod
    def item_with_id(items, object_id):
        return next(item for item in items if item["id"] == object_id)

    def authenticated_client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_persisted_total_is_shared_by_all_order_apis(self):
        add_cart_item(self.customer_session, self.menu_item, quantity=3)
        self.menu_item.price = Decimal("123.45")
        self.menu_item.save(update_fields=("price", "updated_at"))

        cart_response = self.customer_client.get(self.cart_url)

        self.assertEqual(cart_response.status_code, status.HTTP_200_OK)
        self.assertEqual(cart_response.data["items"][0]["unit_price"], "123.45")
        self.assertEqual(cart_response.data["items"][0]["line_total"], "370.35")
        self.assertEqual(cart_response.data["total"], "370.35")

        checkout_response = self.customer_client.post(self.orders_url)
        order = Order.objects.get(pk=checkout_response.data["id"])
        order_item = order.items.get()
        persisted_total = order.total_amount

        self.assertEqual(checkout_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(persisted_total, Decimal("370.35"))
        self.assertEqual(
            persisted_total,
            order_item.price_at_order * order_item.quantity,
        )
        self.assertEqual(order_item.total_price, persisted_total)
        self.assertEqual(
            Decimal(checkout_response.data["total_amount"]),
            persisted_total,
        )

        self.menu_item.price = Decimal("999.99")
        self.menu_item.save(update_fields=("price", "updated_at"))

        customer_response = self.customer_client.get(self.orders_url)
        customer_order = self.item_with_id(
            customer_response.data["orders"],
            order.pk,
        )

        waiter_client = self.authenticated_client(self.waiter)
        waiter_response = waiter_client.get(reverse("waiter-orders"))
        waiter_order = self.item_with_id(waiter_response.data, order.pk)
        waiter_tables_response = waiter_client.get(
            reverse("waiter-table-sessions-my")
        )
        waiter_table = self.item_with_id(
            waiter_tables_response.data,
            self.table_session.pk,
        )

        kitchen_client = self.authenticated_client(self.kitchen)
        kitchen_response = kitchen_client.get(reverse("kitchen-orders"))
        kitchen_order = self.item_with_id(kitchen_response.data, order.pk)

        admin_client = self.authenticated_client(self.admin)
        admin_list_response = admin_client.get(reverse("admin-orders"))
        admin_order = self.item_with_id(admin_list_response.data, order.pk)
        admin_detail_response = admin_client.get(
            reverse("admin-order-detail", args=(order.pk,))
        )

        order.refresh_from_db()
        order_item.refresh_from_db()
        for response_total in (
            customer_order["total_amount"],
            waiter_order["total_amount"],
            waiter_table["total_amount"],
            kitchen_order["total_amount"],
            admin_order["total_amount"],
            admin_detail_response.data["total_amount"],
        ):
            self.assertEqual(Decimal(response_total), persisted_total)
        self.assertEqual(order.total_amount, persisted_total)
        self.assertEqual(order_item.price_at_order, Decimal("123.45"))
        self.assertEqual(order_item.total_price, persisted_total)
        self.assertEqual(
            Decimal(admin_detail_response.data["items"][0]["total_price"]),
            persisted_total,
        )

    def test_waiter_table_total_excludes_cancelled_orders_like_customer_bill(self):
        add_cart_item(self.customer_session, self.menu_item, quantity=2)
        checkout_response = self.customer_client.post(self.orders_url)
        order = Order.objects.get(pk=checkout_response.data["id"])
        order.status = Order.Status.CANCELLED
        order.save(update_fields=("status", "updated_at"))

        customer_response = self.customer_client.get(self.orders_url)
        waiter_client = self.authenticated_client(self.waiter)
        waiter_response = waiter_client.get(reverse("waiter-table-sessions-my"))
        waiter_table = self.item_with_id(
            waiter_response.data,
            self.table_session.pk,
        )

        self.assertEqual(customer_response.data["total_amount"], "0.00")
        self.assertEqual(waiter_table["total_amount"], "0.00")
