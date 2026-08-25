from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.menu.models import Category, MenuItem
from apps.orders.models import Order
from apps.orders.services import assign_waiter_to_table_session
from apps.restaurants.models import Restaurant
from apps.tables.models import ActiveTableSession, RestaurantTable
from apps.tables.services import get_or_create_active_table_session
from apps.users.models import User, WaiterShift


class WaiterManualOrderApiTests(APITestCase):
    def setUp(self):
        self.waiter = User.objects.create_user(
            username="manual-waiter",
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
        self.admin = User.objects.create_user(
            username="admin",
            role=User.Role.ADMIN,
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
        self.unavailable_item = MenuItem.objects.create(
            restaurant=self.restaurant,
            category=self.category,
            name_ky="Манты",
            name_ru="Манты",
            price=Decimal("220.00"),
            is_available=False,
        )
        self.hidden_item = MenuItem.objects.create(
            restaurant=self.restaurant,
            category=self.category,
            name_ky="Жашыруун",
            name_ru="Скрытое",
            price=Decimal("100.00"),
            is_visible=False,
        )
        self.free_table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=1,
        )
        self.own_table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=2,
        )
        self.own_session = assign_waiter_to_table_session(
            get_or_create_active_table_session(self.own_table),
            self.waiter,
        )
        self.other_table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=3,
        )
        self.other_session = assign_waiter_to_table_session(
            get_or_create_active_table_session(self.other_table),
            self.other_waiter,
        )

        self.tables_url = reverse("waiter-manual-order-tables")
        self.menu_url = reverse("waiter-manual-order-menu-items")
        self.create_url = reverse("waiter-manual-order-create")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def order_payload(self, table=None, menu_item=None, quantity=2, comment=""):
        return {
            "table_id": (table or self.free_table).pk,
            "items": [
                {
                    "menu_item_id": (menu_item or self.menu_item).pk,
                    "quantity": quantity,
                    "comment": comment,
                }
            ],
        }

    def test_table_list_marks_tables_assigned_to_another_waiter_unavailable(self):
        self.authenticate(self.waiter)

        response = self.client.get(self.tables_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tables = {item["id"]: item for item in response.data}
        self.assertTrue(tables[self.free_table.pk]["can_use"])
        self.assertTrue(tables[self.own_table.pk]["can_use"])
        self.assertTrue(
            tables[self.own_table.pk]["is_assigned_to_current_waiter"]
        )
        self.assertFalse(tables[self.other_table.pk]["can_use"])
        self.assertEqual(
            tables[self.other_table.pk]["unavailable_reason"],
            "ASSIGNED_TO_ANOTHER_WAITER",
        )

    def test_menu_list_includes_unavailable_but_excludes_hidden_items(self):
        self.authenticate(self.waiter)

        response = self.client.get(
            self.menu_url,
            {"table_id": self.free_table.pk},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        items = {item["id"]: item for item in response.data}
        self.assertTrue(items[self.menu_item.pk]["is_available"])
        self.assertFalse(items[self.unavailable_item.pk]["is_available"])
        self.assertNotIn(self.hidden_item.pk, items)

    def test_menu_list_exposes_sales_labels_and_prep_time(self):
        self.menu_item.is_hit = True
        self.menu_item.is_new = True
        self.menu_item.is_spicy = True
        self.menu_item.is_vegetarian = True
        self.menu_item.is_recommended = True
        self.menu_item.cooking_time_min = 15
        self.menu_item.save()
        self.authenticate(self.waiter)

        response = self.client.get(
            self.menu_url,
            {"table_id": self.free_table.pk},
        )

        item = next(
            item for item in response.data if item["id"] == self.menu_item.pk
        )
        self.assertTrue(item["is_hit"])
        self.assertTrue(item["is_new"])
        self.assertTrue(item["is_spicy"])
        self.assertTrue(item["is_vegetarian"])
        self.assertTrue(item["is_recommended"])
        self.assertEqual(item["cooking_time_min"], 15)

    def test_waiter_can_create_manual_order_for_free_table(self):
        self.authenticate(self.waiter)

        response = self.client.post(
            self.create_url,
            self.order_payload(comment="Пиязсыз"),
            format="json",
        )

        self.free_table.refresh_from_db()
        order = Order.objects.get(pk=response.data["id"])
        table_session = order.table_session
        order_item = order.items.get()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.free_table.status, RestaurantTable.Status.OCCUPIED)
        self.assertEqual(table_session.status, ActiveTableSession.Status.ACTIVE)
        self.assertEqual(table_session.assigned_waiter, self.waiter)
        self.assertEqual(order.responsible_waiter, self.waiter)
        self.assertIsNone(order.customer_session)
        self.assertEqual(order.source, Order.Source.WAITER_MANUAL)
        self.assertEqual(order.status, Order.Status.NEW)
        self.assertEqual(order.total_amount, Decimal("500.00"))
        self.assertEqual(order_item.name_ky_at_order, self.menu_item.name_ky)
        self.assertEqual(order_item.name_ru_at_order, self.menu_item.name_ru)
        self.assertEqual(order_item.price_at_order, Decimal("250.00"))
        self.assertEqual(order_item.quantity, 2)
        self.assertEqual(order_item.comment, "Пиязсыз")

    def test_manual_order_appears_in_kitchen_queue(self):
        self.authenticate(self.waiter)
        create_response = self.client.post(
            self.create_url,
            self.order_payload(),
            format="json",
        )
        self.authenticate(self.kitchen)

        response = self.client.get(reverse("kitchen-orders"))

        order_data = next(
            item for item in response.data if item["id"] == create_response.data["id"]
        )
        self.assertEqual(order_data["source"], Order.Source.WAITER_MANUAL)

    def test_manual_order_source_appears_in_admin_history(self):
        self.authenticate(self.waiter)
        create_response = self.client.post(
            self.create_url,
            self.order_payload(),
            format="json",
        )
        self.authenticate(self.admin)

        response = self.client.get(reverse("admin-orders"))

        order_data = next(
            item for item in response.data if item["id"] == create_response.data["id"]
        )
        self.assertEqual(order_data["source"], Order.Source.WAITER_MANUAL)

    def test_waiter_can_claim_occupied_unassigned_table_for_manual_order(self):
        unassigned_table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=4,
        )
        unassigned_session = get_or_create_active_table_session(unassigned_table)
        self.authenticate(self.waiter)

        response = self.client.post(
            self.create_url,
            self.order_payload(table=unassigned_table, quantity=1),
            format="json",
        )

        unassigned_session.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(unassigned_session.assigned_waiter, self.waiter)
        self.assertEqual(response.data["table_session"], unassigned_session.pk)

    def test_waiter_can_create_additional_order_for_own_table(self):
        self.authenticate(self.waiter)

        first_response = self.client.post(
            self.create_url,
            self.order_payload(table=self.own_table, quantity=1),
            format="json",
        )
        second_response = self.client.post(
            self.create_url,
            self.order_payload(table=self.own_table, quantity=2),
            format="json",
        )

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            first_response.data["table_session"],
            self.own_session.pk,
        )
        self.assertEqual(
            second_response.data["table_session"],
            self.own_session.pk,
        )
        self.assertEqual(self.own_session.orders.count(), 2)

    def test_waiter_cannot_create_order_for_another_waiters_table(self):
        self.authenticate(self.waiter)

        response = self.client.post(
            self.create_url,
            self.order_payload(table=self.other_table),
            format="json",
        )

        self.other_session.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.other_session.assigned_waiter, self.other_waiter)
        self.assertFalse(
            Order.objects.filter(table_session=self.other_session).exists()
        )

    def test_kitchen_admin_and_anonymous_cannot_create_manual_order(self):
        for user, expected_status in (
            (self.kitchen, status.HTTP_403_FORBIDDEN),
            (self.admin, status.HTTP_403_FORBIDDEN),
            (None, status.HTTP_401_UNAUTHORIZED),
        ):
            with self.subTest(user=getattr(user, "username", "anonymous")):
                self.client.force_authenticate(user=user)
                response = self.client.post(
                    self.create_url,
                    self.order_payload(),
                    format="json",
                )
                self.assertEqual(response.status_code, expected_status)
        self.assertFalse(
            Order.objects.filter(table_session__table=self.free_table).exists()
        )

    def test_unavailable_item_cannot_be_ordered_manually(self):
        self.authenticate(self.waiter)

        response = self.client.post(
            self.create_url,
            self.order_payload(menu_item=self.unavailable_item),
            format="json",
        )

        self.free_table.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.free_table.status, RestaurantTable.Status.FREE)
        self.assertFalse(
            ActiveTableSession.objects.filter(
                table=self.free_table,
                status=ActiveTableSession.Status.ACTIVE,
            ).exists()
        )

    def test_hidden_item_cannot_be_ordered_manually(self):
        self.authenticate(self.waiter)

        response = self.client.post(
            self.create_url,
            self.order_payload(menu_item=self.hidden_item),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            Order.objects.filter(table_session__table=self.free_table).exists()
        )

    def test_item_from_another_restaurant_cannot_be_ordered_manually(self):
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
            price=Decimal("99.00"),
        )
        self.authenticate(self.waiter)

        response = self.client.post(
            self.create_url,
            self.order_payload(menu_item=other_item),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            Order.objects.filter(table_session__table=self.free_table).exists()
        )

    def test_empty_items_and_non_positive_quantity_are_rejected(self):
        self.authenticate(self.waiter)

        empty_response = self.client.post(
            self.create_url,
            {"table_id": self.free_table.pk, "items": []},
            format="json",
        )
        quantity_response = self.client.post(
            self.create_url,
            self.order_payload(quantity=0),
            format="json",
        )

        self.assertEqual(empty_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(quantity_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_waiter_without_active_shift_cannot_create_manual_order(self):
        off_shift_waiter = User.objects.create_user(
            username="off-shift",
            role=User.Role.WAITER,
        )
        self.authenticate(off_shift_waiter)

        response = self.client.post(
            self.create_url,
            self.order_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
