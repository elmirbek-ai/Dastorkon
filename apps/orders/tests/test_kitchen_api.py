from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.menu.models import Category, MenuItem
from apps.orders.models import Order, OrderStatusHistory
from apps.orders.services import change_order_status, create_order
from apps.restaurants.models import Restaurant
from apps.tables.models import RestaurantTable
from apps.tables.services import (
    create_customer_session,
    get_or_create_active_table_session,
)
from apps.users.models import User


class KitchenOrdersApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin",
            role=User.Role.ADMIN,
        )
        self.waiter = User.objects.create_user(
            username="waiter",
            role=User.Role.WAITER,
        )
        self.kitchen = User.objects.create_user(
            username="kitchen",
            role=User.Role.KITCHEN,
        )
        self.restaurant = Restaurant.objects.create(name="Dastorkon")
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
            price=Decimal("250.00"),
        )
        self.table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=1,
        )
        self.table_session = get_or_create_active_table_session(self.table)
        self.customer_session = create_customer_session(self.table_session)
        self.orders_url = reverse("kitchen-orders")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def create_test_order(self, target_status=Order.Status.NEW, comment=""):
        order = create_order(
            self.customer_session,
            [
                {
                    "menu_item": self.menu_item,
                    "quantity": 1,
                    "comment": comment,
                }
            ],
        )
        for next_status in (
            Order.Status.PREPARING,
            Order.Status.READY,
            Order.Status.DELIVERED,
            Order.Status.COMPLETED,
        ):
            if order.status == target_status:
                break
            order = change_order_status(order, next_status)
        if target_status == Order.Status.CANCELLED:
            order.status = Order.Status.CANCELLED
            order.save(update_fields=("status", "updated_at"))
        return order

    def test_anonymous_user_cannot_access_kitchen_api(self):
        response = self.client.get(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_cannot_access_kitchen_api(self):
        self.authenticate(self.admin)

        response = self.client.get(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_waiter_cannot_access_kitchen_api(self):
        self.authenticate(self.waiter)

        response = self.client.get(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_kitchen_can_list_new_orders(self):
        self.authenticate(self.kitchen)
        order = self.create_test_order()

        response = self.client.get(self.orders_url)

        self.assertIn(order.pk, [item["id"] for item in response.data])

    def test_kitchen_can_list_preparing_orders(self):
        self.authenticate(self.kitchen)
        order = self.create_test_order(Order.Status.PREPARING)

        response = self.client.get(self.orders_url)

        self.assertIn(order.pk, [item["id"] for item in response.data])

    def test_kitchen_list_excludes_ready_orders(self):
        self.authenticate(self.kitchen)
        order = self.create_test_order(Order.Status.READY)

        response = self.client.get(self.orders_url)

        self.assertNotIn(order.pk, [item["id"] for item in response.data])

    def test_kitchen_list_excludes_delivered_orders(self):
        self.authenticate(self.kitchen)
        order = self.create_test_order(Order.Status.DELIVERED)

        response = self.client.get(self.orders_url)

        self.assertNotIn(order.pk, [item["id"] for item in response.data])

    def test_kitchen_list_excludes_completed_orders(self):
        self.authenticate(self.kitchen)
        order = self.create_test_order(Order.Status.COMPLETED)

        response = self.client.get(self.orders_url)

        self.assertNotIn(order.pk, [item["id"] for item in response.data])

    def test_kitchen_list_excludes_cancelled_orders(self):
        self.authenticate(self.kitchen)
        order = self.create_test_order(Order.Status.CANCELLED)

        response = self.client.get(self.orders_url)

        self.assertNotIn(order.pk, [item["id"] for item in response.data])

    def test_kitchen_list_includes_order_items_and_comments(self):
        self.authenticate(self.kitchen)
        order = self.create_test_order(comment="Пиязсыз")

        response = self.client.get(self.orders_url)

        order_data = next(item for item in response.data if item["id"] == order.pk)
        self.assertEqual(order_data["table_number"], self.table.number)
        self.assertEqual(order_data["source"], Order.Source.CUSTOMER_QR)
        self.assertEqual(order_data["items"][0]["comment"], "Пиязсыз")

    def test_kitchen_can_mark_new_order_preparing(self):
        self.authenticate(self.kitchen)
        order = self.create_test_order()
        url = reverse("kitchen-order-preparing", args=(order.pk,))

        response = self.client.post(url)

        order.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(order.status, Order.Status.PREPARING)

    def test_kitchen_cannot_mark_preparing_order_preparing_again(self):
        self.authenticate(self.kitchen)
        order = self.create_test_order(Order.Status.PREPARING)
        url = reverse("kitchen-order-preparing", args=(order.pk,))

        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_kitchen_cannot_mark_ready_order_preparing(self):
        self.authenticate(self.kitchen)
        order = self.create_test_order(Order.Status.READY)
        url = reverse("kitchen-order-preparing", args=(order.pk,))

        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_kitchen_can_mark_preparing_order_ready(self):
        self.authenticate(self.kitchen)
        order = self.create_test_order(Order.Status.PREPARING)
        url = reverse("kitchen-order-ready", args=(order.pk,))

        response = self.client.post(url)

        order.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(order.status, Order.Status.READY)

    def test_kitchen_cannot_mark_new_order_ready(self):
        self.authenticate(self.kitchen)
        order = self.create_test_order()
        url = reverse("kitchen-order-ready", args=(order.pk,))

        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_kitchen_status_change_creates_history(self):
        self.authenticate(self.kitchen)
        order = self.create_test_order()
        url = reverse("kitchen-order-preparing", args=(order.pk,))

        self.client.post(url)

        self.assertTrue(
            OrderStatusHistory.objects.filter(
                order=order,
                from_status=Order.Status.NEW,
                to_status=Order.Status.PREPARING,
                changed_by=self.kitchen,
            ).exists()
        )
