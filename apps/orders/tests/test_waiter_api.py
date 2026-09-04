from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.menu.models import Category, MenuItem
from apps.orders.models import Order, WaiterCall
from apps.orders.services import (
    assign_waiter_to_table_session,
    change_order_status,
    complete_waiter_call,
    create_order,
)
from apps.restaurants.models import Restaurant
from apps.tables.models import ActiveTableSession, RestaurantTable
from apps.tables.services import (
    create_customer_session,
    get_or_create_active_table_session,
)
from apps.users.models import User, WaiterShift


class WaiterOrdersApiTests(APITestCase):
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
        self.off_shift_waiter = User.objects.create_user(
            username="off-shift",
            role=User.Role.WAITER,
        )
        self.kitchen = User.objects.create_user(
            username="kitchen",
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
            price=Decimal("250.00"),
        )
        self.table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=1,
        )
        self.table_session = get_or_create_active_table_session(self.table)
        self.customer_session = create_customer_session(self.table_session)

        self.available_url = reverse("waiter-table-sessions-available")
        self.my_sessions_url = reverse("waiter-table-sessions-my")
        self.orders_url = reverse("waiter-orders")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def assign_session(self, waiter=None):
        waiter = waiter or self.waiter
        self.table_session = assign_waiter_to_table_session(
            self.table_session,
            waiter,
        )
        return self.table_session

    def create_test_order(self, target_status=Order.Status.NEW):
        order = create_order(
            self.customer_session,
            [{"menu_item": self.menu_item, "quantity": 1}],
        )
        transitions = (
            Order.Status.PREPARING,
            Order.Status.READY,
            Order.Status.DELIVERED,
            Order.Status.COMPLETED,
        )
        for next_status in transitions:
            if order.status == target_status:
                break
            order = change_order_status(order, next_status)
        return order

    def prepare_delivered_session(self):
        self.assign_session()
        return self.create_test_order(Order.Status.DELIVERED)

    def create_waiter_call(self, call_status):
        return WaiterCall.objects.create(
            restaurant=self.restaurant,
            table_session=self.table_session,
            customer_session=self.customer_session,
            assigned_waiter=self.waiter,
            reason=WaiterCall.Reason.WAITER_NEEDED,
            status=call_status,
        )

    def close_url(self, table_session=None):
        table_session = table_session or self.table_session
        return reverse(
            "waiter-table-session-close",
            args=(table_session.pk,),
        )

    def test_anonymous_user_cannot_access_waiter_orders_api(self):
        response = self.client.get(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_cannot_access_waiter_orders_api(self):
        self.authenticate(self.admin)

        response = self.client.get(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_kitchen_cannot_access_waiter_orders_api(self):
        self.authenticate(self.kitchen)

        response = self.client.get(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_waiter_without_active_shift_cannot_access_endpoints(self):
        self.authenticate(self.off_shift_waiter)

        response = self.client.get(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("shift", response.data["detail"].lower())

    def test_waiter_can_list_available_unassigned_table_sessions(self):
        self.authenticate(self.waiter)
        order = self.create_test_order()

        response = self.client.get(self.available_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in response.data], [self.table_session.pk])
        self.assertEqual(response.data[0]["orders_count"], 1)
        self.assertEqual(response.data[0]["total_amount"], "250.00")
        self.assertEqual(order.table_session_id, self.table_session.pk)

    def test_available_sessions_exclude_already_assigned_sessions(self):
        self.authenticate(self.waiter)
        self.create_test_order()
        self.assign_session(self.other_waiter)

        response = self.client.get(self.available_url)

        self.assertEqual(response.data, [])

    def test_available_sessions_exclude_sessions_without_orders(self):
        self.authenticate(self.waiter)
        self.create_test_order()
        empty_table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=2,
        )
        empty_session = get_or_create_active_table_session(empty_table)

        response = self.client.get(self.available_url)

        session_ids = [item["id"] for item in response.data]
        self.assertIn(self.table_session.pk, session_ids)
        self.assertNotIn(empty_session.pk, session_ids)

    def test_waiter_can_accept_available_table_session(self):
        self.authenticate(self.waiter)
        self.create_test_order()
        url = reverse(
            "waiter-table-session-accept",
            args=(self.table_session.pk,),
        )

        response = self.client.post(url)

        self.table_session.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.table_session.assigned_waiter, self.waiter)
        self.assertEqual(response.data["assigned_waiter"], self.waiter.pk)

    def test_accepting_same_session_twice_is_idempotent(self):
        self.authenticate(self.waiter)
        url = reverse(
            "waiter-table-session-accept",
            args=(self.table_session.pk,),
        )
        first_response = self.client.post(url)

        second_response = self.client.post(url)

        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.data["id"], first_response.data["id"])

    def test_another_waiter_cannot_accept_assigned_session(self):
        self.authenticate(self.waiter)
        url = reverse(
            "waiter-table-session-accept",
            args=(self.table_session.pk,),
        )
        self.client.post(url)
        self.authenticate(self.other_waiter)

        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_waiter_can_list_own_assigned_table_sessions(self):
        self.authenticate(self.waiter)
        self.assign_session()

        response = self.client.get(self.my_sessions_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in response.data], [self.table_session.pk])

    def test_waiter_can_list_own_active_orders(self):
        self.authenticate(self.waiter)
        self.assign_session()
        active_order = self.create_test_order()
        completed_order = self.create_test_order(Order.Status.COMPLETED)

        response = self.client.get(self.orders_url)

        order_ids = [item["id"] for item in response.data]
        self.assertIn(active_order.pk, order_ids)
        self.assertNotIn(completed_order.pk, order_ids)

    def test_waiter_cannot_see_another_waiters_orders(self):
        self.authenticate(self.waiter)
        self.assign_session(self.other_waiter)
        order = self.create_test_order()

        response = self.client.get(self.orders_url)

        self.assertNotIn(order.pk, [item["id"] for item in response.data])

    def test_waiter_can_mark_ready_order_delivered(self):
        self.authenticate(self.waiter)
        self.assign_session()
        order = self.create_test_order(Order.Status.READY)
        url = reverse("waiter-order-delivered", args=(order.pk,))

        response = self.client.post(url)

        order.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(order.status, Order.Status.DELIVERED)

    def test_waiter_cannot_mark_another_waiters_order_delivered(self):
        self.authenticate(self.waiter)
        self.assign_session(self.other_waiter)
        order = self.create_test_order(Order.Status.READY)
        url = reverse("waiter-order-delivered", args=(order.pk,))

        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_waiter_cannot_mark_new_order_delivered(self):
        self.authenticate(self.waiter)
        self.assign_session()
        order = self.create_test_order()
        url = reverse("waiter-order-delivered", args=(order.pk,))

        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_assigned_waiter_can_close_delivered_table_session(self):
        self.authenticate(self.waiter)
        self.prepare_delivered_session()

        response = self.client.post(self.close_url())

        self.table_session.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.table_session.status,
            ActiveTableSession.Status.CLOSED,
        )

    def test_closing_table_session_completes_delivered_orders(self):
        self.authenticate(self.waiter)
        order = self.prepare_delivered_session()

        self.client.post(self.close_url())

        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.COMPLETED)

    def test_closing_table_session_sets_table_free(self):
        self.authenticate(self.waiter)
        self.prepare_delivered_session()

        self.client.post(self.close_url())

        self.table.refresh_from_db()
        self.assertEqual(self.table.status, RestaurantTable.Status.FREE)

    def test_closing_table_session_closes_customer_sessions(self):
        self.authenticate(self.waiter)
        self.prepare_delivered_session()

        self.client.post(self.close_url())

        self.customer_session.refresh_from_db()
        self.assertFalse(self.customer_session.is_active)
        self.assertIsNotNone(self.customer_session.closed_at)

    def test_waiter_cannot_close_session_with_new_waiter_call(self):
        self.authenticate(self.waiter)
        order = self.prepare_delivered_session()
        waiter_call = self.create_waiter_call(WaiterCall.Status.NEW)

        response = self.client.post(self.close_url())

        self.table_session.refresh_from_db()
        self.table.refresh_from_db()
        order.refresh_from_db()
        waiter_call.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "TABLE_HAS_UNRESOLVED_CALLS")
        self.assertEqual(response.data["unresolved_calls"], 1)
        self.assertIn("waiter calls", response.data["detail"].lower())
        self.assertEqual(
            self.table_session.status,
            ActiveTableSession.Status.ACTIVE,
        )
        self.assertEqual(self.table.status, RestaurantTable.Status.OCCUPIED)
        self.assertEqual(order.status, Order.Status.DELIVERED)
        self.assertEqual(waiter_call.status, WaiterCall.Status.NEW)

    def test_waiter_cannot_close_session_with_accepted_waiter_call(self):
        self.authenticate(self.waiter)
        self.prepare_delivered_session()
        self.create_waiter_call(WaiterCall.Status.ACCEPTED)

        response = self.client.post(self.close_url())

        self.table_session.refresh_from_db()
        self.table.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "TABLE_HAS_UNRESOLVED_CALLS")
        self.assertEqual(response.data["unresolved_calls"], 1)
        self.assertEqual(
            self.table_session.status,
            ActiveTableSession.Status.ACTIVE,
        )
        self.assertEqual(self.table.status, RestaurantTable.Status.OCCUPIED)

    def test_waiter_can_close_session_after_waiter_calls_are_completed(self):
        self.authenticate(self.waiter)
        order = self.prepare_delivered_session()
        waiter_call = self.create_waiter_call(WaiterCall.Status.ACCEPTED)
        complete_waiter_call(waiter_call, self.waiter)

        response = self.client.post(self.close_url())

        self.table_session.refresh_from_db()
        self.table.refresh_from_db()
        order.refresh_from_db()
        waiter_call.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.table_session.status,
            ActiveTableSession.Status.CLOSED,
        )
        self.assertEqual(self.table.status, RestaurantTable.Status.FREE)
        self.assertEqual(order.status, Order.Status.COMPLETED)
        self.assertEqual(waiter_call.status, WaiterCall.Status.DONE)

    def test_waiter_cannot_close_another_waiters_table_session(self):
        self.authenticate(self.waiter)
        self.assign_session(self.other_waiter)

        response = self.client.post(self.close_url())

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_waiter_cannot_close_session_with_unfinished_orders(self):
        self.authenticate(self.waiter)
        self.assign_session()
        order = self.create_test_order()

        for order_status in (
            Order.Status.NEW,
            Order.Status.PREPARING,
            Order.Status.READY,
        ):
            if order.status != order_status:
                order = change_order_status(order, order_status)
            with self.subTest(order_status=order_status):
                response = self.client.post(self.close_url())
                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )
