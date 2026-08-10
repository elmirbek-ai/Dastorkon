import asyncio
from decimal import Decimal

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.test import TestCase

from apps.menu.models import Category, MenuItem
from apps.orders.models import Order, WaiterCall
from apps.orders.services import (
    accept_waiter_call,
    assign_waiter_to_table_session,
    change_order_status,
    complete_waiter_call,
    create_order,
    create_waiter_call,
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

    def test_create_order_notifies_kitchen(self):
        channel = self.subscribe("kitchen")
        with self.captureOnCommitCallbacks(execute=True):
            order = self.create_test_order()

        payload = self.assert_event(channel, "order_created")
        self.assertEqual(payload["id"], order.pk)

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
