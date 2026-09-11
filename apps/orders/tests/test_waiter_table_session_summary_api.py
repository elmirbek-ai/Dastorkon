from datetime import timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.menu.models import Category, MenuItem
from apps.orders.models import Order
from apps.orders.services import (
    assign_waiter_to_table_session,
    create_manual_order,
    create_order,
)
from apps.restaurants.models import Restaurant
from apps.tables.models import RestaurantTable
from apps.tables.services import (
    create_customer_session,
    get_or_create_active_table_session,
)
from apps.users.models import User, WaiterShift


class WaiterTableSessionSummaryApiTests(APITestCase):
    def setUp(self):
        self.waiter = User.objects.create_user(
            username="summary-waiter",
            role=User.Role.WAITER,
        )
        self.other_waiter = User.objects.create_user(
            username="other-summary-waiter",
            role=User.Role.WAITER,
        )
        self.off_shift_waiter = User.objects.create_user(
            username="off-shift-summary-waiter",
            role=User.Role.WAITER,
        )
        self.admin = User.objects.create_user(
            username="summary-admin",
            role=User.Role.ADMIN,
        )
        self.kitchen = User.objects.create_user(
            username="summary-kitchen",
            role=User.Role.KITCHEN,
        )
        WaiterShift.objects.create(waiter=self.waiter)
        WaiterShift.objects.create(waiter=self.other_waiter)

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
            price=Decimal("100.00"),
        )
        self.table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=5,
        )
        self.table_session = get_or_create_active_table_session(self.table)
        self.customer_one = create_customer_session(self.table_session)
        self.customer_two = create_customer_session(self.table_session)
        self.scan_only_customer = create_customer_session(table=self.table)
        self.summary_url = reverse(
            "waiter-table-session-summary",
            args=(self.table_session.pk,),
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def assign_session(self, waiter=None):
        self.table_session = assign_waiter_to_table_session(
            self.table_session,
            waiter or self.waiter,
        )

    def create_customer_order(
        self,
        customer_session,
        *,
        quantity=1,
        order_status=Order.Status.NEW,
    ):
        order = create_order(
            customer_session,
            [{"menu_item": self.menu_item, "quantity": quantity}],
        )
        if order_status != Order.Status.NEW:
            order.status = order_status
            order.save(update_fields=("status", "updated_at"))
        return order

    def create_manual_order(
        self,
        *,
        quantity=1,
        order_status=Order.Status.NEW,
    ):
        order = create_manual_order(
            self.waiter,
            self.table.pk,
            [{"menu_item_id": self.menu_item.pk, "quantity": quantity}],
        )
        if order_status != Order.Status.NEW:
            order.status = order_status
            order.save(update_fields=("status", "updated_at"))
        return order

    def get_summary(self):
        self.authenticate(self.waiter)
        return self.client.get(self.summary_url)

    def assert_key_is_not_exposed(self, value, key):
        if isinstance(value, dict):
            self.assertNotIn(key, value)
            for nested_value in value.values():
                self.assert_key_is_not_exposed(nested_value, key)
        elif isinstance(value, list):
            for nested_value in value:
                self.assert_key_is_not_exposed(nested_value, key)

    def test_summary_groups_customers_and_reconciles_all_totals(self):
        self.assign_session()
        customer_two_order = self.create_customer_order(
            self.customer_two,
            quantity=6,
        )
        completed_order = self.create_customer_order(
            self.customer_one,
            quantity=2,
            order_status=Order.Status.COMPLETED,
        )
        active_order = self.create_customer_order(
            self.customer_one,
            quantity=3,
        )
        cancelled_order = self.create_customer_order(
            self.customer_one,
            quantity=1,
            order_status=Order.Status.CANCELLED,
        )
        manual_order = self.create_manual_order(quantity=4)
        cancelled_manual_order = self.create_manual_order(
            quantity=2,
            order_status=Order.Status.CANCELLED,
        )
        first_created_at = timezone.now() - timedelta(hours=1)
        for index, order in enumerate(
            (
                customer_two_order,
                completed_order,
                active_order,
                cancelled_order,
                manual_order,
                cancelled_manual_order,
            )
        ):
            Order.objects.filter(pk=order.pk).update(
                created_at=first_created_at + timedelta(minutes=index)
            )

        response = self.get_summary()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.table_session.pk)
        self.assertEqual(
            response.data["table"],
            {"id": self.table.pk, "number": self.table.number},
        )
        self.assertEqual(
            response.data["restaurant"],
            {"id": self.restaurant.pk, "name": self.restaurant.name},
        )
        self.assertEqual(response.data["assigned_waiter"], self.waiter.pk)
        self.assertEqual(response.data["orders_count"], 6)
        self.assertEqual(response.data["customer_count"], 2)
        self.assertEqual(response.data["total_amount"], "1500.00")

        customers = response.data["customers"]
        self.assertEqual(
            [customer["customer_session_id"] for customer in customers],
            [self.customer_two.pk, self.customer_one.pk],
        )
        self.assertEqual(
            [customer["customer_number"] for customer in customers],
            [1, 2],
        )
        self.assertEqual(customers[0]["orders_count"], 1)
        self.assertEqual(customers[0]["subtotal"], "600.00")
        self.assertEqual(
            [order["id"] for order in customers[0]["orders"]],
            [customer_two_order.pk],
        )
        self.assertTrue(
            {
                "id",
                "order_number",
                "source",
                "status",
                "total_amount",
                "created_at",
                "items",
            }.issubset(customers[0]["orders"][0])
        )
        self.assertEqual(len(customers[0]["orders"][0]["items"]), 1)
        self.assertEqual(customers[1]["orders_count"], 3)
        self.assertEqual(customers[1]["subtotal"], "500.00")
        self.assertEqual(
            [order["id"] for order in customers[1]["orders"]],
            [completed_order.pk, active_order.pk, cancelled_order.pk],
        )
        self.assertIn(
            Order.Status.COMPLETED,
            [order["status"] for order in customers[1]["orders"]],
        )
        self.assertIn(
            Order.Status.CANCELLED,
            [order["status"] for order in customers[1]["orders"]],
        )

        manual_orders = response.data["manual_orders"]
        self.assertEqual(manual_orders["orders_count"], 2)
        self.assertEqual(manual_orders["subtotal"], "400.00")
        self.assertEqual(
            [order["id"] for order in manual_orders["orders"]],
            [manual_order.pk, cancelled_manual_order.pk],
        )
        self.assertTrue(
            all(
                order["source"] == Order.Source.WAITER_MANUAL
                for order in manual_orders["orders"]
            )
        )
        grouped_total = sum(
            (Decimal(customer["subtotal"]) for customer in customers),
            Decimal("0.00"),
        ) + Decimal(manual_orders["subtotal"])
        self.assertEqual(grouped_total, Decimal(response.data["total_amount"]))
        self.assertNotIn(
            self.scan_only_customer.pk,
            [customer["customer_session_id"] for customer in customers],
        )
        self.assert_key_is_not_exposed(response.data, "session_key")

    def test_customer_numbering_uses_session_id_when_first_orders_tie(self):
        later_customer_order = self.create_customer_order(self.customer_two)
        earlier_customer_order = self.create_customer_order(self.customer_one)
        same_created_at = timezone.now() - timedelta(minutes=5)
        Order.objects.filter(
            pk__in=(later_customer_order.pk, earlier_customer_order.pk)
        ).update(created_at=same_created_at)

        response = self.get_summary()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [group["customer_session_id"] for group in response.data["customers"]],
            [self.customer_one.pk, self.customer_two.pk],
        )
        self.assertEqual(
            [group["customer_number"] for group in response.data["customers"]],
            [1, 2],
        )

    def test_available_session_customer_count_ignores_scan_only_sessions(self):
        self.create_customer_order(self.customer_one)
        self.create_customer_order(self.customer_one)
        self.create_customer_order(self.customer_two)
        self.authenticate(self.waiter)

        response = self.client.get(reverse("waiter-table-sessions-available"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        table_session = next(
            item for item in response.data if item["id"] == self.table_session.pk
        )
        self.assertEqual(table_session["orders_count"], 3)
        self.assertEqual(table_session["customer_count"], 2)

    def test_manual_orders_are_not_counted_as_customers_in_session_list(self):
        self.create_customer_order(self.customer_one)
        self.create_manual_order(quantity=2)
        self.authenticate(self.waiter)

        response = self.client.get(reverse("waiter-table-sessions-my"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        table_session = next(
            item for item in response.data if item["id"] == self.table_session.pk
        )
        self.assertEqual(table_session["orders_count"], 2)
        self.assertEqual(table_session["customer_count"], 1)

    def test_assigned_waiter_can_access_summary(self):
        self.assign_session()
        self.create_customer_order(self.customer_one)

        response = self.get_summary()

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_on_shift_waiter_can_access_unassigned_active_summary(self):
        self.create_customer_order(self.customer_one)

        response = self.get_summary()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["assigned_waiter"])

    def test_waiter_cannot_access_session_assigned_to_another_waiter(self):
        self.assign_session(self.other_waiter)
        self.authenticate(self.waiter)

        response = self.client.get(self.summary_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_waiter_without_active_shift_cannot_access_summary(self):
        self.authenticate(self.off_shift_waiter)

        response = self.client.get(self.summary_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("shift", response.data["detail"].lower())

    def test_nonexistent_session_returns_not_found(self):
        self.authenticate(self.waiter)
        missing_url = reverse(
            "waiter-table-session-summary",
            args=(self.table_session.pk + 999,),
        )

        response = self.client.get(missing_url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_anonymous_admin_and_kitchen_cannot_access_summary(self):
        response = self.client.get(self.summary_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        for user in (self.admin, self.kitchen):
            with self.subTest(role=user.role):
                self.authenticate(user)
                response = self.client.get(self.summary_url)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_summary_query_count_does_not_grow_with_customers_or_orders(self):
        self.assign_session()
        self.create_customer_order(self.customer_one)
        self.create_customer_order(self.customer_one)
        self.create_customer_order(self.customer_two)
        self.create_manual_order()
        self.authenticate(self.waiter)

        with self.assertNumQueries(4):
            response = self.client.get(self.summary_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
