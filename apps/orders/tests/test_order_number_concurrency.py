import threading
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from unittest.mock import patch

from django.db import close_old_connections
from django.test import TransactionTestCase, skipUnlessDBFeature

from apps.menu.models import Category, MenuItem
from apps.orders.models import Order
from apps.orders.services import (
    add_cart_item,
    create_manual_order,
    create_order_from_cart,
)
from apps.restaurants.models import Restaurant
from apps.tables.models import CustomerSession, RestaurantTable
from apps.tables.services import create_customer_session
from apps.users.models import User, WaiterShift


@skipUnlessDBFeature("has_select_for_update")
class OrderNumberConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Concurrent orders")
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
        self.customer_sessions = []
        for number in (1, 2):
            table = RestaurantTable.objects.create(
                restaurant=self.restaurant,
                number=number,
            )
            customer_session = create_customer_session(table=table)
            add_cart_item(customer_session, self.menu_item)
            self.customer_sessions.append(customer_session)

        self.waiter = User.objects.create_user(
            username="concurrent-waiter",
            role=User.Role.WAITER,
        )
        WaiterShift.objects.create(waiter=self.waiter)
        self.manual_tables = [
            RestaurantTable.objects.create(
                restaurant=self.restaurant,
                number=number,
            )
            for number in (3, 4)
        ]

    @staticmethod
    def run_concurrently(worker, object_ids):
        barrier = threading.Barrier(len(object_ids))

        def synchronized_worker(object_id):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return worker(object_id)
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=len(object_ids)) as executor:
            futures = [
                executor.submit(synchronized_worker, object_id)
                for object_id in object_ids
            ]
            return [future.result(timeout=20) for future in futures]

    @patch("apps.orders.services.enqueue_notification_on_commit")
    def test_concurrent_customer_checkouts_get_unique_order_numbers(
        self,
        _enqueue_notification,
    ):
        def create_customer_order(customer_session_id):
            customer_session = CustomerSession.objects.get(
                pk=customer_session_id
            )
            return create_order_from_cart(customer_session).order_number

        order_numbers = self.run_concurrently(
            create_customer_order,
            [session.pk for session in self.customer_sessions],
        )

        self.assertEqual(len(order_numbers), 2)
        self.assertEqual(len(set(order_numbers)), 2)
        self.assertEqual(
            Order.objects.filter(source=Order.Source.CUSTOMER_QR).count(),
            2,
        )

    @patch("apps.orders.services.enqueue_notification_on_commit")
    def test_concurrent_manual_orders_get_unique_order_numbers(
        self,
        _enqueue_notification,
    ):
        def create_waiter_order(table_id):
            waiter = User.objects.get(pk=self.waiter.pk)
            menu_item = MenuItem.objects.get(pk=self.menu_item.pk)
            return create_manual_order(
                waiter,
                table_id,
                [{"menu_item": menu_item, "quantity": 1}],
            ).order_number

        order_numbers = self.run_concurrently(
            create_waiter_order,
            [table.pk for table in self.manual_tables],
        )

        self.assertEqual(len(order_numbers), 2)
        self.assertEqual(len(set(order_numbers)), 2)
        self.assertEqual(
            Order.objects.filter(source=Order.Source.WAITER_MANUAL).count(),
            2,
        )
