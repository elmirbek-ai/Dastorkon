from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.menu.models import Category, MenuItem
from apps.orders.models import (
    CartItem,
    Order,
    OrderItem,
    OrderStatusHistory,
    WaiterCall,
)
from apps.restaurants.models import Restaurant
from apps.tables.models import (
    ActiveTableSession,
    CustomerSession,
    RestaurantTable,
)
from apps.users.models import User, WaiterShift


class EndpointQueryCountTests(APITestCase):
    """Protect high-traffic collection serializers against N+1 queries."""

    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Dastorkon")
        self.table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=1,
        )
        self.table_session = ActiveTableSession.objects.create(
            restaurant=self.restaurant,
            table=self.table,
        )
        self.customer_session = CustomerSession.objects.create(
            active_table_session=self.table_session,
        )
        self.category = Category.objects.create(
            restaurant=self.restaurant,
            name_ky="Main",
            name_ru="Main",
        )
        self.menu_item = MenuItem.objects.create(
            restaurant=self.restaurant,
            category=self.category,
            name_ky="Pilaf",
            name_ru="Pilaf",
            price=Decimal("250.00"),
        )
        self.admin = User.objects.create_user(
            username="query-admin",
            role=User.Role.ADMIN,
        )
        self.waiter = User.objects.create_user(
            username="query-waiter",
            role=User.Role.WAITER,
        )
        self.kitchen = User.objects.create_user(
            username="query-kitchen",
            role=User.Role.KITCHEN,
        )
        WaiterShift.objects.create(waiter=self.waiter)
        self._order_number = 0
        self._table_number = 1

    def capture_get(self, url, expected_length=None, response_key=None):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        if expected_length is not None:
            payload = response.data[response_key] if response_key else response.data
            self.assertEqual(len(payload), expected_length)
        return len(queries)

    def assert_query_count_stable(self, small_count, large_count):
        self.assertEqual(
            large_count,
            small_count,
            f"Query count grew with result size: {small_count} -> {large_count}",
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def use_customer_cookie(self):
        self.client.cookies["customer_session_key"] = str(
            self.customer_session.session_key
        )

    def create_table_session(self, assigned_waiter=None):
        self._table_number += 1
        table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=self._table_number,
        )
        table_session = ActiveTableSession.objects.create(
            restaurant=self.restaurant,
            table=table,
            assigned_waiter=assigned_waiter,
        )
        customer_session = CustomerSession.objects.create(
            active_table_session=table_session,
        )
        return table_session, customer_session

    def create_order(
        self,
        *,
        table_session=None,
        customer_session=None,
        responsible_waiter=None,
        order_status=Order.Status.NEW,
        item_count=3,
    ):
        table_session = table_session or self.table_session
        customer_session = customer_session or self.customer_session
        self._order_number += 1
        order = Order.objects.create(
            restaurant=self.restaurant,
            table_session=table_session,
            customer_session=customer_session,
            order_number=f"QUERY-{self._order_number:04d}",
            responsible_waiter=responsible_waiter,
            status=order_status,
            total_amount=Decimal("750.00"),
        )
        OrderItem.objects.bulk_create(
            [
                OrderItem(
                    order=order,
                    menu_item=self.menu_item,
                    name_ky_at_order=f"Item {item_index}",
                    name_ru_at_order=f"Item {item_index}",
                    price_at_order=Decimal("250.00"),
                    quantity=1,
                    total_price=Decimal("250.00"),
                )
                for item_index in range(item_count)
            ]
        )
        return order

    def add_menu_grid(self):
        MenuItem.objects.bulk_create(
            [
                MenuItem(
                    restaurant=self.restaurant,
                    category=self.category,
                    name_ky=f"Base item {item_index}",
                    name_ru=f"Base item {item_index}",
                    price=Decimal("100.00"),
                )
                for item_index in range(4)
            ]
        )
        for category_index in range(1, 5):
            category = Category.objects.create(
                restaurant=self.restaurant,
                name_ky=f"Category {category_index}",
                name_ru=f"Category {category_index}",
                sort_order=category_index,
            )
            MenuItem.objects.bulk_create(
                [
                    MenuItem(
                        restaurant=self.restaurant,
                        category=category,
                        name_ky=f"Item {category_index}-{item_index}",
                        name_ru=f"Item {category_index}-{item_index}",
                        price=Decimal("100.00"),
                    )
                    for item_index in range(5)
                ]
            )

    def test_public_menu_queries_stay_stable_for_five_by_five_menu(self):
        url = reverse("public-menu", args=(self.table.qr_token,))

        small_count = self.capture_get(url, expected_length=1, response_key="categories")
        self.add_menu_grid()
        large_count = self.capture_get(url, expected_length=5, response_key="categories")

        self.assert_query_count_stable(small_count, large_count)

    def test_public_cart_queries_stay_stable_with_more_items(self):
        self.use_customer_cookie()
        CartItem.objects.create(
            customer_session=self.customer_session,
            menu_item=self.menu_item,
            quantity=1,
        )
        url = reverse("public-cart", args=(self.table.qr_token,))

        small_count = self.capture_get(url, expected_length=1, response_key="items")
        extra_items = []
        for item_index in range(14):
            menu_item = MenuItem.objects.create(
                restaurant=self.restaurant,
                category=self.category,
                name_ky=f"Cart item {item_index}",
                name_ru=f"Cart item {item_index}",
                price=Decimal("100.00"),
            )
            extra_items.append(
                CartItem(
                    customer_session=self.customer_session,
                    menu_item=menu_item,
                    quantity=1,
                )
            )
        CartItem.objects.bulk_create(extra_items)
        large_count = self.capture_get(url, expected_length=15, response_key="items")

        self.assert_query_count_stable(small_count, large_count)

    def test_public_orders_queries_stay_stable_for_five_orders(self):
        self.use_customer_cookie()
        self.create_order()
        url = reverse("public-orders", args=(self.table.qr_token,))

        small_count = self.capture_get(url, expected_length=1, response_key="orders")
        for _ in range(4):
            self.create_order()
        large_count = self.capture_get(url, expected_length=5, response_key="orders")

        self.assert_query_count_stable(small_count, large_count)

    def test_available_table_session_queries_stay_stable(self):
        self.authenticate(self.waiter)
        self.create_order()
        url = reverse("waiter-table-sessions-available")

        small_count = self.capture_get(url, expected_length=1)
        for _ in range(4):
            table_session, customer_session = self.create_table_session()
            self.create_order(
                table_session=table_session,
                customer_session=customer_session,
            )
        large_count = self.capture_get(url, expected_length=5)

        self.assert_query_count_stable(small_count, large_count)

    def test_my_table_session_queries_stay_stable(self):
        self.authenticate(self.waiter)
        self.table_session.assigned_waiter = self.waiter
        self.table_session.save(update_fields=("assigned_waiter", "updated_at"))
        self.create_order(responsible_waiter=self.waiter)
        url = reverse("waiter-table-sessions-my")

        small_count = self.capture_get(url, expected_length=1)
        for _ in range(4):
            table_session, customer_session = self.create_table_session(self.waiter)
            self.create_order(
                table_session=table_session,
                customer_session=customer_session,
                responsible_waiter=self.waiter,
            )
        large_count = self.capture_get(url, expected_length=5)

        self.assert_query_count_stable(small_count, large_count)

    def test_waiter_order_queries_stay_stable_for_five_orders(self):
        self.authenticate(self.waiter)
        self.table_session.assigned_waiter = self.waiter
        self.table_session.save(update_fields=("assigned_waiter", "updated_at"))
        self.create_order(responsible_waiter=self.waiter)
        url = reverse("waiter-orders")

        small_count = self.capture_get(url, expected_length=1)
        for _ in range(4):
            self.create_order(responsible_waiter=self.waiter)
        large_count = self.capture_get(url, expected_length=5)

        self.assert_query_count_stable(small_count, large_count)

    def test_waiter_call_queries_stay_stable_with_more_calls(self):
        self.authenticate(self.waiter)
        WaiterCall.objects.create(
            restaurant=self.restaurant,
            table_session=self.table_session,
            customer_session=self.customer_session,
            reason=WaiterCall.Reason.WAITER_NEEDED,
        )
        url = reverse("waiter-calls")

        small_count = self.capture_get(url, expected_length=1)
        WaiterCall.objects.bulk_create(
            [
                WaiterCall(
                    restaurant=self.restaurant,
                    table_session=self.table_session,
                    customer_session=self.customer_session,
                    reason=WaiterCall.Reason.HELP_NEEDED,
                )
                for _ in range(9)
            ]
        )
        large_count = self.capture_get(url, expected_length=10)

        self.assert_query_count_stable(small_count, large_count)

    def test_kitchen_order_queries_stay_stable_for_five_orders(self):
        self.authenticate(self.kitchen)
        self.create_order()
        url = reverse("kitchen-orders")

        small_count = self.capture_get(url, expected_length=1)
        for _ in range(4):
            self.create_order()
        large_count = self.capture_get(url, expected_length=5)

        self.assert_query_count_stable(small_count, large_count)

    def test_admin_order_list_queries_stay_stable_for_five_orders(self):
        self.authenticate(self.admin)
        self.create_order()
        url = reverse("admin-orders")

        small_count = self.capture_get(url, expected_length=1)
        for _ in range(4):
            self.create_order()
        large_count = self.capture_get(url, expected_length=5)

        self.assert_query_count_stable(small_count, large_count)

    def test_admin_order_detail_queries_stay_stable_with_nested_rows(self):
        self.authenticate(self.admin)
        order = self.create_order(item_count=1)
        OrderStatusHistory.objects.create(
            order=order,
            from_status="",
            to_status=Order.Status.NEW,
            changed_by=self.admin,
        )
        url = reverse("admin-order-detail", args=(order.pk,))

        small_count = self.capture_get(url)
        OrderItem.objects.bulk_create(
            [
                OrderItem(
                    order=order,
                    menu_item=self.menu_item,
                    name_ky_at_order=f"Detail item {item_index}",
                    name_ru_at_order=f"Detail item {item_index}",
                    price_at_order=Decimal("100.00"),
                    quantity=1,
                    total_price=Decimal("100.00"),
                )
                for item_index in range(14)
            ]
        )
        OrderStatusHistory.objects.bulk_create(
            [
                OrderStatusHistory(
                    order=order,
                    from_status=Order.Status.NEW,
                    to_status=Order.Status.PREPARING,
                    changed_by=self.admin,
                )
                for _ in range(9)
            ]
        )
        large_count = self.capture_get(url)

        self.assertEqual(len(self.client.get(url).data["items"]), 15)
        self.assertEqual(len(self.client.get(url).data["status_history"]), 10)
        self.assert_query_count_stable(small_count, large_count)

    def test_admin_table_queries_stay_stable_with_more_tables(self):
        self.authenticate(self.admin)
        url = reverse("admin-table-list")

        small_count = self.capture_get(url, expected_length=1)
        RestaurantTable.objects.bulk_create(
            [
                RestaurantTable(
                    restaurant=self.restaurant,
                    number=table_number,
                )
                for table_number in range(2, 11)
            ]
        )
        large_count = self.capture_get(url, expected_length=10)

        self.assert_query_count_stable(small_count, large_count)

    def test_admin_menu_item_queries_stay_stable_for_five_by_five_menu(self):
        self.authenticate(self.admin)
        url = reverse("admin-menu-item-list")

        small_count = self.capture_get(url, expected_length=1)
        self.add_menu_grid()
        large_count = self.capture_get(url, expected_length=25)

        self.assert_query_count_stable(small_count, large_count)

    def test_admin_user_queries_stay_stable_with_more_users(self):
        self.authenticate(self.admin)
        url = reverse("admin-user-list")

        small_count = self.capture_get(url, expected_length=3)
        for user_index in range(10):
            User.objects.create_user(
                username=f"query-user-{user_index}",
                role=User.Role.WAITER,
            )
        large_count = self.capture_get(url, expected_length=13)

        self.assert_query_count_stable(small_count, large_count)
