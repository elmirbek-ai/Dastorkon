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
    complete_table_session,
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


class AdminStatisticsApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin",
            role=User.Role.ADMIN,
        )
        self.waiter = User.objects.create_user(
            username="waiter",
            role=User.Role.WAITER,
        )
        self.other_waiter = User.objects.create_user(
            username="other-waiter",
            role=User.Role.WAITER,
        )
        self.kitchen = User.objects.create_user(
            username="kitchen",
            role=User.Role.KITCHEN,
        )
        WaiterShift.objects.create(waiter=self.waiter)
        WaiterShift.objects.create(waiter=self.other_waiter)

        self.restaurant = Restaurant.objects.create(name="Dastorkon")
        category = Category.objects.create(
            restaurant=self.restaurant,
            name_ky="Негизги тамактар",
            name_ru="Основные блюда",
        )
        self.menu_item = MenuItem.objects.create(
            restaurant=self.restaurant,
            category=category,
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
        customer_session = create_customer_session(self.table_session)

        self.first_order = self.create_order(
            customer_session,
            self.menu_item,
            quantity=2,
            completed=True,
            created_at=datetime(2026, 1, 10, 12, tzinfo=UTC),
        )
        self.second_order = self.create_order(
            customer_session,
            self.menu_item,
            quantity=1,
            completed=True,
            created_at=datetime(2026, 1, 20, 12, tzinfo=UTC),
        )
        self.new_order = self.create_order(
            customer_session,
            self.menu_item,
            quantity=1,
            completed=False,
            created_at=datetime(2026, 2, 10, 12, tzinfo=UTC),
        )

        self.other_restaurant = Restaurant.objects.create(name="Other")
        other_category = Category.objects.create(
            restaurant=self.other_restaurant,
            name_ky="Башка",
            name_ru="Другое",
        )
        self.other_item = MenuItem.objects.create(
            restaurant=self.other_restaurant,
            category=other_category,
            name_ky="Манты",
            name_ru="Манты",
            price=Decimal("50.00"),
        )
        self.other_table = RestaurantTable.objects.create(
            restaurant=self.other_restaurant,
            number=2,
        )
        other_session = get_or_create_active_table_session(self.other_table)
        other_session = assign_waiter_to_table_session(
            other_session,
            self.other_waiter,
        )
        other_customer = create_customer_session(other_session)
        self.other_order = self.create_order(
            other_customer,
            self.other_item,
            quantity=4,
            completed=True,
            created_at=datetime(2026, 3, 10, 12, tzinfo=UTC),
        )
        self.url = reverse("admin-statistics-summary")

    def create_order(
        self,
        customer_session,
        menu_item,
        quantity,
        completed,
        created_at,
    ):
        order = create_order(
            customer_session,
            [{"menu_item": menu_item, "quantity": quantity}],
        )
        if completed:
            order.status = Order.Status.COMPLETED
            order.save(update_fields=("status", "updated_at"))
        Order.objects.filter(pk=order.pk).update(created_at=created_at)
        order.refresh_from_db()
        return order

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_anonymous_user_cannot_access_statistics(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_waiter_cannot_access_statistics(self):
        self.authenticate(self.waiter)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_kitchen_cannot_access_statistics(self):
        self.authenticate(self.kitchen)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_access_statistics_summary(self):
        self.authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("popular_items", response.data)

    def test_total_orders_counts_all_orders(self):
        self.authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.data["total_orders"], 4)
        self.assertEqual(response.data["completed_orders"], 3)

    def test_completed_amount_uses_only_completed_orders(self):
        self.authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.data["completed_amount"], "500.00")

    def test_average_order_amount_is_correct(self):
        self.authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.data["average_order_amount"], "166.67")

    def test_orders_by_status_is_correct(self):
        self.authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.data["orders_by_status"][Order.Status.NEW], 1)
        self.assertEqual(
            response.data["orders_by_status"][Order.Status.COMPLETED],
            3,
        )

    def test_popular_items_is_correct(self):
        self.authenticate(self.admin)

        response = self.client.get(self.url)

        popular = {
            item["name_ky_at_order"]: item
            for item in response.data["popular_items"]
        }
        self.assertEqual(popular["Палоо"]["total_quantity"], 3)
        self.assertEqual(popular["Палоо"]["total_amount"], "300.00")
        self.assertEqual(popular["Манты"]["total_quantity"], 4)

    def test_table_stats_is_correct(self):
        self.authenticate(self.admin)

        response = self.client.get(self.url)

        table_stats = {item["table"]: item for item in response.data["table_stats"]}
        self.assertEqual(table_stats[self.table.pk]["orders_count"], 2)
        self.assertEqual(table_stats[self.table.pk]["total_amount"], "300.00")

    def test_waiter_stats_is_correct(self):
        self.authenticate(self.admin)

        response = self.client.get(self.url)

        waiter_stats = {
            item["waiter"]: item
            for item in response.data["waiter_stats"]
        }
        self.assertEqual(waiter_stats[self.waiter.pk]["orders_count"], 2)
        self.assertEqual(
            waiter_stats[self.other_waiter.pk]["total_amount"],
            "200.00",
        )

    def test_waiter_stats_include_waiter_assigned_on_delivery(self):
        self.new_order.responsible_waiter = None
        self.new_order.save(
            update_fields=("responsible_waiter", "updated_at")
        )
        self.new_order = change_order_status(
            self.new_order,
            Order.Status.PREPARING,
            self.kitchen,
        )
        self.new_order = change_order_status(
            self.new_order,
            Order.Status.READY,
            self.kitchen,
        )
        self.new_order = mark_order_delivered(self.new_order, self.waiter)
        complete_table_session(self.table_session, self.waiter)
        self.authenticate(self.admin)

        response = self.client.get(self.url)

        waiter_stats = {
            item["waiter"]: item for item in response.data["waiter_stats"]
        }
        self.assertEqual(waiter_stats[self.waiter.pk]["orders_count"], 3)
        self.assertEqual(
            waiter_stats[self.waiter.pk]["total_amount"],
            "400.00",
        )

    def test_statistics_filters_by_restaurant(self):
        self.authenticate(self.admin)

        response = self.client.get(
            self.url,
            {"restaurant": self.restaurant.pk},
        )

        self.assertEqual(response.data["total_orders"], 3)
        self.assertEqual(response.data["completed_orders"], 2)
        self.assertEqual(response.data["completed_amount"], "300.00")

    def test_statistics_filters_by_date_range(self):
        self.authenticate(self.admin)

        response = self.client.get(
            self.url,
            {"date_from": "2026-01-01", "date_to": "2026-01-31"},
        )

        self.assertEqual(response.data["total_orders"], 2)
        self.assertEqual(response.data["completed_amount"], "300.00")
