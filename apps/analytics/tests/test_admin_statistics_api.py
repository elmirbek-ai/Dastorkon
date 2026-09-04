from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.menu.models import Category, MenuItem
from apps.analytics.services import build_comparison
from apps.orders.models import Order, OrderStatusHistory
from apps.orders.services import (
    assign_waiter_to_table_session,
    change_order_status,
    complete_table_session,
    create_order,
    mark_order_delivered,
)
from apps.restaurants.models import Restaurant
from apps.tables.models import ActiveTableSession, RestaurantTable
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
        self.customer_session = create_customer_session(self.table_session)

        self.first_order = self.create_order(
            self.customer_session,
            self.menu_item,
            quantity=2,
            completed=True,
            created_at=datetime(2026, 1, 10, 12, tzinfo=UTC),
        )
        self.second_order = self.create_order(
            self.customer_session,
            self.menu_item,
            quantity=1,
            completed=True,
            created_at=datetime(2026, 1, 20, 12, tzinfo=UTC),
        )
        self.new_order = self.create_order(
            self.customer_session,
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

    def set_order_status_at(self, order, status_value, changed_at):
        previous_status = order.status
        order.status = status_value
        order.save(update_fields=("status", "updated_at"))
        history = OrderStatusHistory.objects.create(
            order=order,
            from_status=previous_status,
            to_status=status_value,
            changed_by=self.admin,
        )
        OrderStatusHistory.objects.filter(pk=history.pk).update(
            created_at=changed_at,
        )

    def get_dashboard_kpis_response(self, now):
        self.authenticate(self.admin)
        with patch("apps.analytics.services.timezone.now", return_value=now):
            return self.client.get(
                self.url,
                {
                    "restaurant": self.restaurant.pk,
                    "include_dashboard_comparison": "true",
                },
            )

    def test_anonymous_user_cannot_access_statistics(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_dashboard_comparison_flag_controls_top_level_response(self):
        now = datetime(2026, 4, 15, 12, tzinfo=UTC)
        self.authenticate(self.admin)

        with patch("apps.analytics.services.timezone.now", return_value=now):
            included_response = self.client.get(
                self.url,
                {
                    "restaurant": self.restaurant.pk,
                    "include_dashboard_comparison": "true",
                },
            )
            excluded_response = self.client.get(
                self.url,
                {
                    "restaurant": self.restaurant.pk,
                    "include_dashboard_comparison": "false",
                },
            )

        self.assertEqual(included_response.status_code, status.HTTP_200_OK)
        self.assertIn("dashboard_kpis", included_response.data)
        self.assertEqual(
            set(included_response.data["dashboard_kpis"]),
            {
                "today_orders",
                "completed_orders",
                "active_tables",
                "today_revenue",
            },
        )
        dashboard_kpis = included_response.data["dashboard_kpis"]
        self.assertEqual(dashboard_kpis["today_orders"]["value"], 0)
        self.assertEqual(dashboard_kpis["today_orders"]["previous"], 0)
        self.assertEqual(dashboard_kpis["today_orders"]["delta_percent"], 0)
        self.assertEqual(dashboard_kpis["today_orders"]["trend"], "neutral")
        self.assertEqual(dashboard_kpis["today_revenue"]["value"], "0.00")
        self.assertIsNotNone(dashboard_kpis["active_tables"]["value"])
        self.assertIsNotNone(dashboard_kpis["active_tables"]["total"])
        self.assertNotIn("dashboard_kpis", excluded_response.data)

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

    def test_statistics_range_uses_bishkek_boundaries_for_revenue(self):
        self.create_order(
            self.customer_session,
            self.menu_item,
            quantity=1,
            completed=True,
            created_at=datetime(2026, 1, 9, 17, 59, 59, tzinfo=UTC),
        )
        self.create_order(
            self.customer_session,
            self.menu_item,
            quantity=1,
            completed=True,
            created_at=datetime(2026, 1, 9, 18, 0, tzinfo=UTC),
        )
        self.create_order(
            self.customer_session,
            self.menu_item,
            quantity=1,
            completed=True,
            created_at=datetime(2026, 1, 10, 18, 0, tzinfo=UTC),
        )
        self.authenticate(self.admin)

        response = self.client.get(
            self.url,
            {"date_from": "2026-01-10", "date_to": "2026-01-10"},
        )

        self.assertEqual(response.data["total_orders"], 2)
        self.assertEqual(response.data["completed_orders"], 2)
        self.assertEqual(response.data["completed_amount"], "300.00")

    def test_dashboard_kpis_compare_real_today_and_yesterday_values(self):
        now = datetime(2026, 4, 15, 12, tzinfo=UTC)
        yesterday_order = self.create_order(
            self.customer_session,
            self.menu_item,
            quantity=1,
            completed=False,
            created_at=datetime(2026, 4, 14, 9, tzinfo=UTC),
        )
        today_order = self.create_order(
            self.customer_session,
            self.menu_item,
            quantity=2,
            completed=False,
            created_at=datetime(2026, 4, 15, 8, tzinfo=UTC),
        )
        cancelled_order = self.create_order(
            self.customer_session,
            self.menu_item,
            quantity=3,
            completed=False,
            created_at=datetime(2026, 4, 15, 10, tzinfo=UTC),
        )
        self.set_order_status_at(
            yesterday_order,
            Order.Status.COMPLETED,
            datetime(2026, 4, 14, 11, tzinfo=UTC),
        )
        self.set_order_status_at(
            today_order,
            Order.Status.COMPLETED,
            datetime(2026, 4, 15, 11, tzinfo=UTC),
        )
        self.set_order_status_at(
            cancelled_order,
            Order.Status.CANCELLED,
            datetime(2026, 4, 15, 11, 30, tzinfo=UTC),
        )

        response = self.get_dashboard_kpis_response(now)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        kpis = response.data["dashboard_kpis"]
        self.assertEqual(kpis["today_orders"]["value"], 2)
        self.assertEqual(kpis["today_orders"]["previous"], 1)
        self.assertEqual(kpis["today_orders"]["delta_percent"], 100)
        self.assertEqual(kpis["today_orders"]["trend"], "up")
        self.assertEqual(kpis["completed_orders"]["value"], 1)
        self.assertEqual(kpis["completed_orders"]["previous"], 1)
        self.assertEqual(kpis["completed_orders"]["delta_percent"], 0)
        self.assertEqual(kpis["completed_orders"]["trend"], "neutral")
        self.assertEqual(kpis["today_revenue"]["value"], "200.00")
        self.assertEqual(kpis["today_revenue"]["previous"], "100.00")
        self.assertEqual(kpis["today_revenue"]["delta_percent"], 100)

    def test_dashboard_kpis_use_bishkek_day_near_utc_boundary(self):
        now = datetime(2026, 4, 14, 18, 30, tzinfo=UTC)
        yesterday_order = self.create_order(
            self.customer_session,
            self.menu_item,
            quantity=1,
            completed=False,
            created_at=datetime(2026, 4, 14, 17, 59, tzinfo=UTC),
        )
        today_order = self.create_order(
            self.customer_session,
            self.menu_item,
            quantity=2,
            completed=False,
            created_at=datetime(2026, 4, 14, 18, 1, tzinfo=UTC),
        )
        self.set_order_status_at(
            yesterday_order,
            Order.Status.COMPLETED,
            datetime(2026, 4, 14, 17, 59, tzinfo=UTC),
        )
        self.set_order_status_at(
            today_order,
            Order.Status.COMPLETED,
            datetime(2026, 4, 14, 18, 2, tzinfo=UTC),
        )

        response = self.get_dashboard_kpis_response(now)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        kpis = response.data["dashboard_kpis"]
        self.assertEqual(kpis["today_orders"]["value"], 1)
        self.assertEqual(kpis["today_orders"]["previous"], 1)
        self.assertEqual(kpis["completed_orders"]["value"], 1)
        self.assertEqual(kpis["completed_orders"]["previous"], 1)
        self.assertEqual(kpis["today_revenue"]["value"], "200.00")
        self.assertEqual(kpis["today_revenue"]["previous"], "100.00")

    def test_dashboard_kpis_previous_zero_does_not_invent_percentage(self):
        now = datetime(2026, 5, 15, 12, tzinfo=UTC)
        self.create_order(
            self.customer_session,
            self.menu_item,
            quantity=1,
            completed=False,
            created_at=datetime(2026, 5, 15, 9, tzinfo=UTC),
        )

        response = self.get_dashboard_kpis_response(now)

        comparison = response.data["dashboard_kpis"]["today_orders"]
        self.assertEqual(comparison["value"], 1)
        self.assertEqual(comparison["previous"], 0)
        self.assertIsNone(comparison["delta_percent"])
        self.assertEqual(comparison["trend"], "up")

    def test_dashboard_kpis_use_historical_table_session_timestamps(self):
        now = datetime(2026, 6, 15, 12, tzinfo=UTC)
        ActiveTableSession.objects.filter(pk=self.table_session.pk).update(
            opened_at=datetime(2026, 6, 13, 8, tzinfo=UTC),
        )
        second_table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=3,
        )
        historical_session = ActiveTableSession.objects.create(
            restaurant=self.restaurant,
            table=second_table,
            status=ActiveTableSession.Status.CLOSED,
            closed_at=datetime(2026, 6, 14, 14, tzinfo=UTC),
        )
        ActiveTableSession.objects.filter(pk=historical_session.pk).update(
            opened_at=datetime(2026, 6, 14, 8, tzinfo=UTC),
        )

        response = self.get_dashboard_kpis_response(now)

        comparison = response.data["dashboard_kpis"]["active_tables"]
        self.assertEqual(comparison["value"], 1)
        self.assertEqual(comparison["total"], 2)
        self.assertEqual(comparison["previous"], 2)
        self.assertEqual(comparison["delta_percent"], -50)
        self.assertEqual(comparison["trend"], "down")

    def test_comparison_can_represent_unavailable_history(self):
        comparison = build_comparison(3, None)

        self.assertEqual(comparison["value"], 3)
        self.assertIsNone(comparison["previous"])
        self.assertIsNone(comparison["delta_percent"])
        self.assertEqual(comparison["trend"], "unavailable")
