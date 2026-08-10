from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.menu.models import Category, MenuItem
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


class OrderServicesTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Dastorkon")
        self.admin = User.objects.create_user(
            username="admin",
            password="test-pass",
            role=User.Role.ADMIN,
        )
        self.waiter = User.objects.create_user(
            username="waiter",
            password="test-pass",
            role=User.Role.WAITER,
        )
        WaiterShift.objects.create(waiter=self.waiter)
        self.table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=1,
        )
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
        self.table_session = get_or_create_active_table_session(self.table)
        self.customer_session = create_customer_session(self.table_session)

    def create_test_order(self, **item_overrides):
        item_data = {
            "menu_item": self.menu_item,
            "quantity": 2,
            "comment": "Пиязсыз",
        }
        item_data.update(item_overrides)
        return create_order(self.customer_session, [item_data])

    def test_create_order_creates_order_and_items(self):
        order = self.create_test_order()

        order_item = order.items.get()
        self.assertEqual(order.restaurant, self.restaurant)
        self.assertEqual(order.table_session, self.table_session)
        self.assertEqual(order.customer_session, self.customer_session)
        self.assertEqual(order.status, Order.Status.NEW)
        self.assertEqual(order_item.menu_item, self.menu_item)
        self.assertEqual(order_item.quantity, 2)
        self.assertEqual(order_item.comment, "Пиязсыз")
        self.assertTrue(
            order.status_history.filter(
                from_status="",
                to_status=Order.Status.NEW,
            ).exists()
        )

    def test_create_order_stores_snapshot_fields(self):
        order = self.create_test_order()
        order_item = order.items.get()

        self.menu_item.name_ky = "Жаңы аталыш"
        self.menu_item.name_ru = "Новое название"
        self.menu_item.price = Decimal("300.00")
        self.menu_item.save()
        order_item.refresh_from_db()

        self.assertEqual(order_item.name_ky_at_order, "Палоо")
        self.assertEqual(order_item.name_ru_at_order, "Плов")
        self.assertEqual(order_item.price_at_order, Decimal("250.00"))

    def test_create_order_calculates_total_amount(self):
        order = self.create_test_order(quantity=3)

        self.assertEqual(order.total_amount, Decimal("750.00"))
        self.assertEqual(order.items.get().total_price, Decimal("750.00"))

    def test_create_order_rejects_unavailable_menu_item(self):
        self.menu_item.is_available = False
        self.menu_item.save(update_fields=("is_available", "updated_at"))

        with self.assertRaises(ValidationError):
            self.create_test_order()

    def test_create_order_rejects_hidden_menu_item(self):
        self.menu_item.is_visible = False
        self.menu_item.save(update_fields=("is_visible", "updated_at"))

        with self.assertRaises(ValidationError):
            self.create_test_order()

    def test_create_order_rejects_deleted_menu_item(self):
        self.menu_item.is_deleted = True
        self.menu_item.save(update_fields=("is_deleted", "updated_at"))

        with self.assertRaises(ValidationError):
            self.create_test_order()

    def test_create_order_rejects_item_from_another_restaurant(self):
        other_restaurant = Restaurant.objects.create(name="Other")
        other_category = Category.objects.create(
            restaurant=other_restaurant,
            name_ky="Башка",
            name_ru="Другое",
        )
        other_item = MenuItem.objects.create(
            restaurant=other_restaurant,
            category=other_category,
            name_ky="Башка тамак",
            name_ru="Другое блюдо",
            price=Decimal("100.00"),
        )

        with self.assertRaises(ValidationError):
            self.create_test_order(menu_item=other_item)

    def test_assign_waiter_to_table_session_with_active_shift(self):
        table_session = assign_waiter_to_table_session(
            self.table_session,
            self.waiter,
        )

        self.assertEqual(table_session.assigned_waiter, self.waiter)

    def test_assign_waiter_to_table_session_rejects_inactive_waiter(self):
        waiter_without_shift = User.objects.create_user(
            username="off-shift",
            role=User.Role.WAITER,
        )

        with self.assertRaises(ValidationError):
            assign_waiter_to_table_session(
                self.table_session,
                waiter_without_shift,
            )

    def test_assign_waiter_prevents_another_waiter_taking_session(self):
        other_waiter = User.objects.create_user(
            username="other-waiter",
            role=User.Role.WAITER,
        )
        WaiterShift.objects.create(waiter=other_waiter)
        assign_waiter_to_table_session(self.table_session, self.waiter)

        with self.assertRaises(ValidationError):
            assign_waiter_to_table_session(self.table_session, other_waiter)

    def test_change_order_status_allows_valid_transitions(self):
        order = self.create_test_order()

        for status in (
            Order.Status.PREPARING,
            Order.Status.READY,
            Order.Status.DELIVERED,
            Order.Status.COMPLETED,
        ):
            order = change_order_status(order, status, self.admin)

        self.assertEqual(order.status, Order.Status.COMPLETED)
        self.assertEqual(
            list(
                order.status_history.order_by("id").values_list(
                    "to_status",
                    flat=True,
                )
            ),
            [
                Order.Status.NEW,
                Order.Status.PREPARING,
                Order.Status.READY,
                Order.Status.DELIVERED,
                Order.Status.COMPLETED,
            ],
        )

    def test_change_order_status_rejects_invalid_transition(self):
        order = self.create_test_order()

        with self.assertRaises(ValidationError):
            change_order_status(order, Order.Status.READY, self.admin)

        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.NEW)

    def test_change_order_status_rejects_cancelled(self):
        order = self.create_test_order()

        with self.assertRaises(ValidationError):
            change_order_status(order, Order.Status.CANCELLED, self.admin)

        self.assertFalse(
            OrderStatusHistory.objects.filter(
                order=order,
                to_status=Order.Status.CANCELLED,
            ).exists()
        )

    def test_mark_order_delivered_allows_responsible_waiter(self):
        assign_waiter_to_table_session(self.table_session, self.waiter)
        order = self.create_test_order()
        order = change_order_status(order, Order.Status.PREPARING)
        order = change_order_status(order, Order.Status.READY)

        order = mark_order_delivered(order, self.waiter)

        self.assertEqual(order.status, Order.Status.DELIVERED)

    def test_mark_order_delivered_rejects_unrelated_waiter(self):
        assign_waiter_to_table_session(self.table_session, self.waiter)
        order = self.create_test_order()
        order = change_order_status(order, Order.Status.PREPARING)
        order = change_order_status(order, Order.Status.READY)
        unrelated_waiter = User.objects.create_user(
            username="unrelated-waiter",
            role=User.Role.WAITER,
        )

        with self.assertRaises(ValidationError):
            mark_order_delivered(order, unrelated_waiter)

    def test_complete_table_session_blocks_unfinished_orders(self):
        order = self.create_test_order()

        for status in (
            Order.Status.NEW,
            Order.Status.PREPARING,
            Order.Status.READY,
        ):
            if order.status != status:
                order = change_order_status(order, status, self.admin)
            with self.subTest(status=status):
                with self.assertRaises(ValidationError):
                    complete_table_session(self.table_session, self.admin)

        self.table_session.refresh_from_db()
        self.assertEqual(
            self.table_session.status,
            ActiveTableSession.Status.ACTIVE,
        )

    def test_complete_table_session_completes_delivered_orders_and_closes(self):
        order = self.create_test_order()
        for status in (
            Order.Status.PREPARING,
            Order.Status.READY,
            Order.Status.DELIVERED,
        ):
            order = change_order_status(order, status, self.admin)

        complete_table_session(self.table_session, self.admin)

        order.refresh_from_db()
        self.table_session.refresh_from_db()
        self.customer_session.refresh_from_db()
        self.table.refresh_from_db()
        self.assertEqual(order.status, Order.Status.COMPLETED)
        self.assertEqual(
            self.table_session.status,
            ActiveTableSession.Status.CLOSED,
        )
        self.assertFalse(self.customer_session.is_active)
        self.assertEqual(self.table.status, RestaurantTable.Status.FREE)
