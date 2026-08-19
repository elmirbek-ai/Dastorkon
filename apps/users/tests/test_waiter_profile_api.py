from datetime import timedelta
from unittest.mock import patch

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.orders.models import Order, OrderStatusHistory, WaiterCall
from apps.restaurants.models import Restaurant
from apps.tables.models import ActiveTableSession, CustomerSession, RestaurantTable
from apps.users.models import User, WaiterShift


class WaiterProfileApiTests(APITestCase):
    def setUp(self):
        self.url = reverse("waiter-profile")
        self.waiter = User.objects.create_user(
            username="waiter-profile",
            password="password",
            role=User.Role.WAITER,
        )
        self.kitchen = User.objects.create_user(
            username="kitchen-profile",
            role=User.Role.KITCHEN,
        )
        self.admin = User.objects.create_user(
            username="admin-profile",
            role=User.Role.ADMIN,
        )
        self.now = timezone.now().replace(hour=12, minute=0, second=0, microsecond=0)

    def authenticate(self, user=None):
        self.client.force_authenticate(user=user or self.waiter)

    def create_shift(self, started_at, ended_at=None):
        shift = WaiterShift.objects.create(waiter=self.waiter)
        WaiterShift.objects.filter(pk=shift.pk).update(
            started_at=started_at,
            ended_at=ended_at,
            is_active=ended_at is None,
        )
        shift.refresh_from_db()
        return shift

    def get_profile(self, language="ky"):
        with patch("apps.users.services.timezone.now", return_value=self.now):
            return self.client.get(self.url, {"lang": language})

    def test_waiter_can_get_own_profile_with_exact_top_level_shape(self):
        self.create_shift(self.now - timedelta(hours=2), self.now - timedelta(hours=1))
        self.authenticate()

        response = self.get_profile()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            set(response.data),
            {"profile", "shift_summary", "recent_shifts", "work_stats"},
        )
        self.assertEqual(response.data["profile"]["username"], self.waiter.username)
        self.assertEqual(response.data["profile"]["role"], User.Role.WAITER)
        self.assertEqual(
            set(response.data["profile"]),
            {
                "id",
                "username",
                "first_name",
                "last_name",
                "full_name",
                "primary_phone",
                "phone",
                "secondary_phone",
                "avatar",
                "role",
                "role_label",
                "is_active",
                "account_status",
                "date_joined",
                "last_login",
                "profile_completed",
            },
        )
        self.assertEqual(
            set(response.data["shift_summary"]),
            {
                "is_on_shift",
                "current_shift_id",
                "today_shift_started_at",
                "today_shift_ended_at",
                "today_worked_seconds",
                "today_worked_display",
                "last_7_days_worked_seconds",
                "last_7_days_worked_display",
                "last_30_days_worked_seconds",
                "last_30_days_worked_display",
                "total_shifts_count",
            },
        )
        self.assertEqual(
            set(response.data["recent_shifts"][0]),
            {
                "id",
                "date",
                "started_at",
                "ended_at",
                "is_active",
                "duration_seconds",
                "duration_display",
            },
        )
        self.assertEqual(
            set(response.data["work_stats"]),
            {
                "accepted_tables_count",
                "delivered_orders_count",
                "resolved_waiter_calls_count",
                "today_active_tables_count",
                "today_ready_not_delivered_orders_count",
                "average_order_delivery_time_seconds",
                "average_order_delivery_time_display",
            },
        )

    def test_waiter_can_update_editable_profile_fields(self):
        self.authenticate()

        response = self.client.patch(
            self.url,
            {
                "first_name": "Aibek",
                "last_name": "Uulu",
                "phone": "+996700000001",
                "secondary_phone": "+996555000001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.waiter.refresh_from_db()
        self.assertEqual(self.waiter.first_name, "Aibek")
        self.assertEqual(self.waiter.last_name, "Uulu")
        self.assertEqual(self.waiter.phone, "+996700000001")
        self.assertEqual(str(self.waiter.primary_phone), "+996700000001")
        self.assertEqual(self.waiter.secondary_phone, "+996555000001")
        self.assertEqual(response.data["profile"]["full_name"], "Aibek Uulu")

    def test_waiter_can_leave_secondary_phone_empty(self):
        self.authenticate()

        response = self.client.patch(
            self.url,
            {"secondary_phone": ""},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["profile"]["secondary_phone"], "")

    def test_waiter_cannot_update_avatar(self):
        self.authenticate()

        response = self.client.patch(
            self.url,
            {"avatar": "users/avatars/replacement.png"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(str(response.data["avatar"]), "This field cannot be updated.")

    def test_waiter_cannot_use_avatar_remove(self):
        self.authenticate()

        response = self.client.patch(
            self.url,
            {"avatar_remove": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            str(response.data["avatar_remove"]),
            "This field cannot be updated.",
        )

    def test_phone_numbers_are_normalized_to_e164(self):
        self.authenticate()

        response = self.client.patch(
            self.url,
            {
                "first_name": "Aibek",
                "last_name": "Uulu",
                "primary_phone": "0700 000 001",
                "secondary_phone": "0555 000 001",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["profile"]["primary_phone"], "+996700000001")
        self.assertEqual(response.data["profile"]["phone"], "+996700000001")
        self.assertEqual(response.data["profile"]["secondary_phone"], "+996555000001")

    def test_invalid_phone_number_is_rejected(self):
        self.authenticate()

        response = self.client.patch(
            self.url,
            {"primary_phone": "123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("primary_phone", response.data)

    def test_waiter_cannot_update_read_only_security_fields(self):
        self.authenticate()
        forbidden_updates = {
            "role": User.Role.ADMIN,
            "is_active": False,
            "is_staff": True,
            "is_superuser": True,
            "username": "changed-waiter",
            "password": "changed-password",
            "date_joined": self.now.isoformat(),
            "last_login": self.now.isoformat(),
        }

        for field, value in forbidden_updates.items():
            with self.subTest(field=field):
                response = self.client.patch(self.url, {field: value}, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.waiter.refresh_from_db()
        self.assertEqual(self.waiter.role, User.Role.WAITER)
        self.assertTrue(self.waiter.is_active)
        self.assertFalse(self.waiter.is_staff)
        self.assertFalse(self.waiter.is_superuser)
        self.assertEqual(self.waiter.username, "waiter-profile")
        self.assertTrue(self.waiter.check_password("password"))

    def test_profile_completed_is_false_when_required_fields_are_missing(self):
        self.authenticate()

        response = self.get_profile()

        self.assertFalse(response.data["profile"]["profile_completed"])

    def test_profile_completed_is_true_with_name_and_primary_phone(self):
        self.waiter.first_name = "Aibek"
        self.waiter.last_name = "Uulu"
        self.waiter.primary_phone = "+996700000001"
        self.waiter.save(update_fields=("first_name", "last_name", "primary_phone"))
        self.authenticate()

        response = self.get_profile()

        self.assertTrue(response.data["profile"]["profile_completed"])

    def test_unauthenticated_request_is_rejected(self):
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            self.client.patch(
                self.url,
                {"first_name": "Blocked"},
                format="json",
            ).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_kitchen_cannot_access_waiter_profile(self):
        self.authenticate(self.kitchen)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.patch(
                self.url,
                {"first_name": "Blocked"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_admin_cannot_access_waiter_profile(self):
        self.authenticate(self.admin)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.patch(
                self.url,
                {"first_name": "Blocked"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_active_shift_duration_is_calculated_without_crashing(self):
        shift = self.create_shift(self.now - timedelta(hours=2))
        self.authenticate()

        response = self.get_profile()

        self.assertTrue(response.data["shift_summary"]["is_on_shift"])
        self.assertEqual(response.data["shift_summary"]["current_shift_id"], shift.pk)
        self.assertEqual(response.data["recent_shifts"][0]["duration_seconds"], 7200)

    def test_closed_shift_duration_is_calculated(self):
        self.create_shift(
            self.now - timedelta(hours=3),
            self.now - timedelta(hours=1),
        )
        self.authenticate()

        response = self.get_profile()

        self.assertFalse(response.data["recent_shifts"][0]["is_active"])
        self.assertEqual(response.data["recent_shifts"][0]["duration_seconds"], 7200)

    def test_today_worked_duration_sums_closed_and_active_shifts(self):
        self.create_shift(
            self.now - timedelta(hours=5),
            self.now - timedelta(hours=4),
        )
        self.create_shift(self.now - timedelta(hours=2))
        self.authenticate()

        response = self.get_profile()

        self.assertEqual(response.data["shift_summary"]["today_worked_seconds"], 10800)

    def test_last_seven_days_duration_uses_local_date_window(self):
        self.create_shift(
            self.now - timedelta(days=3, hours=2),
            self.now - timedelta(days=3),
        )
        self.create_shift(
            self.now - timedelta(days=8, hours=4),
            self.now - timedelta(days=8),
        )
        self.authenticate()

        response = self.get_profile()

        self.assertEqual(response.data["shift_summary"]["last_7_days_worked_seconds"], 7200)

    def test_last_thirty_days_duration_uses_local_date_window(self):
        self.create_shift(
            self.now - timedelta(days=10, hours=3),
            self.now - timedelta(days=10),
        )
        self.create_shift(
            self.now - timedelta(days=31, hours=4),
            self.now - timedelta(days=31),
        )
        self.authenticate()

        response = self.get_profile()

        self.assertEqual(response.data["shift_summary"]["last_30_days_worked_seconds"], 10800)

    def test_overnight_shift_is_clipped_to_today_boundary(self):
        current_timezone = timezone.get_current_timezone()
        local_now = timezone.localtime(self.now, current_timezone)
        today_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        self.create_shift(today_start - timedelta(hours=2), today_start + timedelta(hours=1))
        self.authenticate()

        response = self.get_profile()

        self.assertEqual(response.data["shift_summary"]["today_worked_seconds"], 3600)

    def test_average_delivery_time_returns_localized_no_data(self):
        self.authenticate()

        response = self.get_profile(language="ru")

        stats = response.data["work_stats"]
        self.assertIsNone(stats["average_order_delivery_time_seconds"])
        self.assertEqual(stats["average_order_delivery_time_display"], "Пока нет данных")

    def test_average_delivery_time_uses_ready_to_delivered_history(self):
        order = self.create_order(Order.Status.DELIVERED)
        ready_history = OrderStatusHistory.objects.create(
            order=order,
            from_status=Order.Status.PREPARING,
            to_status=Order.Status.READY,
        )
        delivered_history = OrderStatusHistory.objects.create(
            order=order,
            from_status=Order.Status.READY,
            to_status=Order.Status.DELIVERED,
            changed_by=self.waiter,
        )
        OrderStatusHistory.objects.filter(pk=ready_history.pk).update(
            created_at=self.now - timedelta(minutes=15)
        )
        OrderStatusHistory.objects.filter(pk=delivered_history.pk).update(
            created_at=self.now - timedelta(minutes=5)
        )
        self.authenticate()

        response = self.get_profile()

        self.assertEqual(
            response.data["work_stats"]["average_order_delivery_time_seconds"],
            600,
        )

    def test_work_statistics_use_existing_assignment_relationships(self):
        active_session = self.create_table_session(1, ActiveTableSession.Status.ACTIVE)
        self.create_table_session(2, ActiveTableSession.Status.CLOSED)
        delivered_order = self.create_order(Order.Status.DELIVERED, active_session)
        self.create_order(Order.Status.COMPLETED, active_session, number="ORDER-2")
        ready_order = self.create_order(Order.Status.READY, active_session, number="ORDER-3")
        ready_order.responsible_waiter = None
        ready_order.save(update_fields=("responsible_waiter", "updated_at"))
        WaiterCall.objects.create(
            restaurant=active_session.restaurant,
            table_session=active_session,
            assigned_waiter=self.waiter,
            reason=WaiterCall.Reason.WAITER_NEEDED,
            status=WaiterCall.Status.DONE,
        )
        self.assertEqual(delivered_order.responsible_waiter, self.waiter)
        self.authenticate()

        response = self.get_profile()

        stats = response.data["work_stats"]
        self.assertEqual(stats["accepted_tables_count"], 2)
        self.assertEqual(stats["delivered_orders_count"], 2)
        self.assertEqual(stats["resolved_waiter_calls_count"], 1)
        self.assertEqual(stats["today_active_tables_count"], 1)
        self.assertEqual(stats["today_ready_not_delivered_orders_count"], 1)

    def create_table_session(self, number, session_status):
        restaurant, _ = Restaurant.objects.get_or_create(name="Profile Restaurant")
        table = RestaurantTable.objects.create(restaurant=restaurant, number=number)
        session = ActiveTableSession.objects.create(
            restaurant=restaurant,
            table=table,
            assigned_waiter=self.waiter,
            status=session_status,
        )
        if session_status == ActiveTableSession.Status.CLOSED:
            session.closed_at = self.now
            session.save(update_fields=("closed_at", "updated_at"))
        return session

    def create_order(self, order_status, table_session=None, number="ORDER-1"):
        table_session = table_session or self.create_table_session(1, ActiveTableSession.Status.ACTIVE)
        customer_session = CustomerSession.objects.create(active_table_session=table_session)
        return Order.objects.create(
            restaurant=table_session.restaurant,
            table_session=table_session,
            customer_session=customer_session,
            order_number=number,
            responsible_waiter=self.waiter,
            status=order_status,
        )
