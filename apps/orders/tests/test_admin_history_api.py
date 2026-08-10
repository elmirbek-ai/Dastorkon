from datetime import UTC, datetime
from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.menu.models import Category, MenuItem
from apps.orders.models import Order
from apps.orders.services import (
    assign_waiter_to_table_session,
    change_order_status,
    create_order,
    mark_order_delivered,
)
from apps.restaurants.models import Restaurant
from apps.tables.models import RestaurantTable
from apps.tables.services import (
    create_customer_session,
    get_or_create_active_table_session,
)
from apps.users.models import User, WaiterShift


class AdminOrderHistoryApiTests(APITestCase):
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
        WaiterShift.objects.create(waiter=self.waiter)

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
        self.table_session = assign_waiter_to_table_session(
            self.table_session,
            self.waiter,
        )
        self.customer_session = create_customer_session(self.table_session)
        self.order = create_order(
            self.customer_session,
            [
                {
                    "menu_item": self.menu_item,
                    "quantity": 2,
                    "comment": "Пиязсыз",
                }
            ],
        )
        self.order = change_order_status(
            self.order,
            Order.Status.PREPARING,
            self.kitchen,
        )

        self.other_restaurant = Restaurant.objects.create(name="Other")
        other_category = Category.objects.create(
            restaurant=self.other_restaurant,
            name_ky="Башка",
            name_ru="Другое",
        )
        other_item = MenuItem.objects.create(
            restaurant=self.other_restaurant,
            category=other_category,
            name_ky="Башка тамак",
            name_ru="Другое блюдо",
            price=Decimal("100.00"),
        )
        self.other_table = RestaurantTable.objects.create(
            restaurant=self.other_restaurant,
            number=1,
        )
        other_table_session = get_or_create_active_table_session(self.other_table)
        other_customer = create_customer_session(other_table_session)
        self.other_order = create_order(
            other_customer,
            [{"menu_item": other_item, "quantity": 1}],
        )
        self.other_order.status = Order.Status.COMPLETED
        self.other_order.save(update_fields=("status", "updated_at"))

        Order.objects.filter(pk=self.order.pk).update(
            created_at=datetime(2026, 1, 10, 12, tzinfo=UTC)
        )
        Order.objects.filter(pk=self.other_order.pk).update(
            created_at=datetime(2026, 2, 10, 12, tzinfo=UTC)
        )
        self.order.refresh_from_db()
        self.other_order.refresh_from_db()
        self.list_url = reverse("admin-orders")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_anonymous_user_cannot_access_order_history(self):
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_waiter_cannot_access_order_history(self):
        self.authenticate(self.waiter)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_kitchen_cannot_access_order_history(self):
        self.authenticate(self.kitchen)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_list_orders(self):
        self.authenticate(self.admin)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_delivered_order_history_shows_responsible_waiter(self):
        self.order.responsible_waiter = None
        self.order.save(update_fields=("responsible_waiter", "updated_at"))
        self.order = change_order_status(
            self.order,
            Order.Status.READY,
            self.kitchen,
        )
        self.order = mark_order_delivered(self.order, self.waiter)
        self.authenticate(self.admin)

        response = self.client.get(self.list_url)

        order_data = next(
            item for item in response.data if item["id"] == self.order.pk
        )
        self.assertEqual(order_data["responsible_waiter"], self.waiter.pk)
        self.assertEqual(
            order_data["responsible_waiter_username"],
            self.waiter.username,
        )

    def test_admin_order_list_is_newest_first(self):
        self.authenticate(self.admin)

        response = self.client.get(self.list_url)

        self.assertEqual(
            [item["id"] for item in response.data],
            [self.other_order.pk, self.order.pk],
        )

    def test_admin_can_filter_orders_by_restaurant(self):
        self.authenticate(self.admin)

        response = self.client.get(
            self.list_url,
            {"restaurant": self.restaurant.pk},
        )

        self.assertEqual([item["id"] for item in response.data], [self.order.pk])

    def test_admin_can_filter_orders_by_table(self):
        self.authenticate(self.admin)

        response = self.client.get(self.list_url, {"table": self.table.pk})

        self.assertEqual([item["id"] for item in response.data], [self.order.pk])

    def test_admin_can_filter_orders_by_waiter(self):
        self.authenticate(self.admin)

        response = self.client.get(self.list_url, {"waiter": self.waiter.pk})

        self.assertEqual([item["id"] for item in response.data], [self.order.pk])

    def test_admin_can_filter_orders_by_status(self):
        self.authenticate(self.admin)

        response = self.client.get(
            self.list_url,
            {"status": Order.Status.COMPLETED},
        )

        self.assertEqual(
            [item["id"] for item in response.data],
            [self.other_order.pk],
        )

    def test_invalid_status_filter_returns_bad_request(self):
        self.authenticate(self.admin)

        response = self.client.get(self.list_url, {"status": "INVALID"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_filter_orders_by_date_range(self):
        self.authenticate(self.admin)

        response = self.client.get(
            self.list_url,
            {"date_from": "2026-01-01", "date_to": "2026-01-31"},
        )

        self.assertEqual([item["id"] for item in response.data], [self.order.pk])

    def test_invalid_date_filter_returns_bad_request(self):
        self.authenticate(self.admin)

        response = self.client.get(self.list_url, {"date_from": "not-a-date"})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_retrieve_order_detail(self):
        self.authenticate(self.admin)
        url = reverse("admin-order-detail", args=(self.order.pk,))

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.order.pk)
        self.assertEqual(response.data["restaurant_name"], self.restaurant.name)
        self.assertEqual(response.data["table"], self.table.pk)

    def test_order_detail_includes_items(self):
        self.authenticate(self.admin)
        url = reverse("admin-order-detail", args=(self.order.pk,))

        response = self.client.get(url)

        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["comment"], "Пиязсыз")

    def test_order_detail_includes_status_history(self):
        self.authenticate(self.admin)
        url = reverse("admin-order-detail", args=(self.order.pk,))

        response = self.client.get(url)

        transitions = [item["to_status"] for item in response.data["status_history"]]
        self.assertIn(Order.Status.NEW, transitions)
        self.assertIn(Order.Status.PREPARING, transitions)
