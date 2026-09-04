import asyncio
from decimal import Decimal
from unittest.mock import patch

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.menu.models import Category, MenuItem
from apps.orders.models import Order, WaiterCall
from apps.orders.services import (
    accept_waiter_call,
    assign_waiter_to_table_session,
    change_order_status,
    complete_waiter_call,
    complete_table_session,
    create_manual_order,
    create_order,
    create_waiter_call,
    mark_order_delivered,
    mark_order_preparing,
    mark_order_ready,
)
from apps.restaurants.models import Restaurant
from apps.tables.models import RestaurantTable
from apps.tables.services import (
    create_customer_session,
    get_or_create_active_table_session,
)
from apps.users.models import User, WaiterShift


class NotificationEventTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Dastorkon")
        self.waiter = User.objects.create_user(
            "waiter",
            role=User.Role.WAITER,
        )
        WaiterShift.objects.create(waiter=self.waiter)
        self.table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=1,
        )
        self.table_session = get_or_create_active_table_session(self.table)
        self.customer_session = create_customer_session(self.table_session)
        category = Category.objects.create(
            restaurant=self.restaurant,
            name_ky="Тамактар",
            name_ru="Блюда",
        )
        self.menu_item = MenuItem.objects.create(
            restaurant=self.restaurant,
            category=category,
            name_ky="Палоо",
            name_ru="Плов",
            price=Decimal("250.00"),
        )
        self.channel_layer = get_channel_layer()

    def subscribe(self, group):
        channel = async_to_sync(self.channel_layer.new_channel)()
        async_to_sync(self.channel_layer.group_add)(group, channel)
        return channel

    def receive(self, channel):
        async def receive_with_timeout():
            return await asyncio.wait_for(
                self.channel_layer.receive(channel),
                timeout=1,
            )

        return async_to_sync(receive_with_timeout)()

    def assert_no_event(self, channel):
        async def receive_if_available():
            try:
                return await asyncio.wait_for(
                    self.channel_layer.receive(channel),
                    timeout=0.05,
                )
            except TimeoutError:
                return None

        self.assertIsNone(async_to_sync(receive_if_available)())

    def create_test_order(self):
        return create_order(
            self.customer_session,
            [{"menu_item": self.menu_item, "quantity": 2}],
        )

    def assert_event(self, channel, event_name):
        message = self.receive(channel)
        self.assertEqual(message["type"], "notification.message")
        self.assertEqual(message["event"], event_name)
        self.assertIsInstance(message["data"], dict)
        return message["data"]

    def run_with_failing_dispatch(self, action):
        with patch(
            "apps.notifications.services.send_notification_to_group",
            side_effect=RuntimeError("Channel layer unavailable"),
        ) as send_mock:
            with self.assertLogs("apps.notifications.services", level="ERROR"):
                with self.captureOnCommitCallbacks(execute=True):
                    result = action()
        self.assertGreater(send_mock.call_count, 0)
        return result

    def test_create_order_notifies_kitchen(self):
        channel = self.subscribe("kitchen")
        with self.captureOnCommitCallbacks(execute=True):
            order = self.create_test_order()
            self.assert_no_event(channel)

        payload = self.assert_event(channel, "order_created")
        self.assertEqual(payload["id"], order.pk)
        self.assertEqual(payload["source"], Order.Source.CUSTOMER_QR)

    def test_create_order_succeeds_when_notification_dispatch_fails(self):
        order = self.run_with_failing_dispatch(self.create_test_order)

        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.NEW)
        self.assertTrue(Order.objects.filter(pk=order.pk).exists())

    def test_order_status_change_succeeds_when_notification_dispatch_fails(self):
        order = self.create_test_order()

        order = self.run_with_failing_dispatch(
            lambda: mark_order_preparing(order)
        )

        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PREPARING)

    def test_waiter_call_creation_succeeds_when_notification_dispatch_fails(self):
        waiter_call = self.run_with_failing_dispatch(
            lambda: create_waiter_call(
                self.customer_session,
                WaiterCall.Reason.WAITER_NEEDED,
            )
        )

        waiter_call.refresh_from_db()
        self.assertEqual(waiter_call.status, WaiterCall.Status.NEW)

    def test_waiter_call_accept_succeeds_when_notification_dispatch_fails(self):
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.HELP_NEEDED,
        )

        waiter_call = self.run_with_failing_dispatch(
            lambda: accept_waiter_call(waiter_call, self.waiter)
        )

        waiter_call.refresh_from_db()
        self.assertEqual(waiter_call.status, WaiterCall.Status.ACCEPTED)
        self.assertEqual(waiter_call.assigned_waiter, self.waiter)

    def test_waiter_call_done_succeeds_when_notification_dispatch_fails(self):
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.EXTRA_ORDER,
        )
        waiter_call = accept_waiter_call(waiter_call, self.waiter)

        waiter_call = self.run_with_failing_dispatch(
            lambda: complete_waiter_call(waiter_call, self.waiter)
        )

        waiter_call.refresh_from_db()
        self.assertEqual(waiter_call.status, WaiterCall.Status.DONE)

    def test_table_close_succeeds_when_notification_dispatch_fails(self):
        assign_waiter_to_table_session(self.table_session, self.waiter)

        table_session = self.run_with_failing_dispatch(
            lambda: complete_table_session(self.table_session, self.waiter)
        )

        table_session.refresh_from_db()
        self.table.refresh_from_db()
        self.assertEqual(table_session.status, table_session.Status.CLOSED)
        self.assertEqual(self.table.status, RestaurantTable.Status.FREE)

    def test_failed_validation_does_not_dispatch_notification(self):
        with patch(
            "apps.notifications.services.send_notification_to_group",
        ) as send_mock:
            with self.captureOnCommitCallbacks(execute=True) as callbacks:
                with self.assertRaises(ValidationError):
                    create_order(
                        self.customer_session,
                        [{"menu_item": self.menu_item, "quantity": 0}],
                    )

        self.assertEqual(callbacks, [])
        send_mock.assert_not_called()
        self.assertFalse(Order.objects.exists())

    def test_manual_order_notifies_kitchen_with_manual_source(self):
        channel = self.subscribe("kitchen")
        with self.captureOnCommitCallbacks(execute=True):
            order = create_manual_order(
                self.waiter,
                self.table.pk,
                [{"menu_item_id": self.menu_item.pk, "quantity": 1}],
            )

        payload = self.assert_event(channel, "order_created")
        self.assertEqual(payload["id"], order.pk)
        self.assertEqual(payload["source"], Order.Source.WAITER_MANUAL)

    def test_mark_order_preparing_notifies_kitchen(self):
        order = self.create_test_order()
        channel = self.subscribe("kitchen")

        with self.captureOnCommitCallbacks(execute=True):
            mark_order_preparing(order)

        self.assert_event(channel, "order_preparing")

    def test_create_order_notifies_waiters_when_unassigned(self):
        channel = self.subscribe("waiters")
        with self.captureOnCommitCallbacks(execute=True):
            self.create_test_order()

        self.assert_event(channel, "order_available")

    def test_create_order_notifies_assigned_waiter(self):
        assign_waiter_to_table_session(self.table_session, self.waiter)
        channel = self.subscribe(f"user_{self.waiter.pk}")
        with self.captureOnCommitCallbacks(execute=True):
            self.create_test_order()

        self.assert_event(channel, "order_created")

    def test_mark_order_ready_notifies_assigned_waiter(self):
        assign_waiter_to_table_session(self.table_session, self.waiter)
        order = self.create_test_order()
        order = change_order_status(order, Order.Status.PREPARING)
        channel = self.subscribe(f"user_{self.waiter.pk}")

        with self.captureOnCommitCallbacks(execute=True):
            mark_order_ready(order)

        self.assert_event(channel, "order_ready")

    def test_mark_order_ready_notifies_waiters_when_unassigned(self):
        order = self.create_test_order()
        order = change_order_status(order, Order.Status.PREPARING)
        channel = self.subscribe("waiters")

        with self.captureOnCommitCallbacks(execute=True):
            mark_order_ready(order)

        self.assert_event(channel, "order_ready")

    def test_mark_order_delivered_notifies_kitchen_and_assigned_waiter(self):
        assign_waiter_to_table_session(self.table_session, self.waiter)
        order = self.create_test_order()
        order = change_order_status(order, Order.Status.PREPARING)
        order = change_order_status(order, Order.Status.READY)
        kitchen_channel = self.subscribe("kitchen")
        waiter_channel = self.subscribe(f"user_{self.waiter.pk}")

        with self.captureOnCommitCallbacks(execute=True):
            mark_order_delivered(order, self.waiter)

        self.assert_event(kitchen_channel, "order_delivered")
        self.assert_event(waiter_channel, "order_delivered")

    def test_assign_table_session_notifies_waiters(self):
        channel = self.subscribe("waiters")

        with self.captureOnCommitCallbacks(execute=True):
            assign_waiter_to_table_session(self.table_session, self.waiter)

        self.assert_event(channel, "table_session_assigned")

    def test_close_table_session_notifies_waiters_and_kitchen(self):
        assign_waiter_to_table_session(self.table_session, self.waiter)
        waiter_channel = self.subscribe("waiters")
        kitchen_channel = self.subscribe("kitchen")

        with self.captureOnCommitCallbacks(execute=True):
            complete_table_session(self.table_session, self.waiter)

        self.assert_event(waiter_channel, "table_session_closed")
        self.assert_event(kitchen_channel, "table_session_closed")

    def test_create_waiter_call_notifies_waiters_when_unassigned(self):
        channel = self.subscribe("waiters")
        with self.captureOnCommitCallbacks(execute=True):
            create_waiter_call(
                self.customer_session,
                WaiterCall.Reason.WAITER_NEEDED,
            )

        self.assert_event(channel, "waiter_call_available")

    def test_create_waiter_call_notifies_assigned_waiter(self):
        assign_waiter_to_table_session(self.table_session, self.waiter)
        channel = self.subscribe(f"user_{self.waiter.pk}")
        with self.captureOnCommitCallbacks(execute=True):
            create_waiter_call(
                self.customer_session,
                WaiterCall.Reason.BILL_REQUEST,
            )

        self.assert_event(channel, "waiter_call_created")

    def test_accept_waiter_call_notifies_waiters(self):
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.HELP_NEEDED,
        )
        channel = self.subscribe("waiters")
        with self.captureOnCommitCallbacks(execute=True):
            accept_waiter_call(waiter_call, self.waiter)

        self.assert_event(channel, "table_session_assigned")
        self.assert_event(channel, "waiter_call_accepted")

    def test_complete_waiter_call_notifies_admins(self):
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.EXTRA_ORDER,
        )
        waiter_call = accept_waiter_call(waiter_call, self.waiter)
        channel = self.subscribe("admins")
        with self.captureOnCommitCallbacks(execute=True):
            complete_waiter_call(waiter_call, self.waiter)

        self.assert_event(channel, "waiter_call_completed")

    def test_complete_waiter_call_notifies_assigned_waiter(self):
        waiter_call = create_waiter_call(
            self.customer_session,
            WaiterCall.Reason.EXTRA_ORDER,
        )
        waiter_call = accept_waiter_call(waiter_call, self.waiter)
        channel = self.subscribe(f"user_{self.waiter.pk}")
        with self.captureOnCommitCallbacks(execute=True):
            complete_waiter_call(waiter_call, self.waiter)

        self.assert_event(channel, "waiter_call_completed")
