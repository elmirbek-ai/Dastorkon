import uuid
from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.menu.models import Category, MenuItem
from apps.orders.models import CartItem, Order, WaiterCall
from apps.orders.services import (
    add_cart_item,
    change_order_status,
    complete_table_session,
    create_order_from_cart,
)
from apps.restaurants.models import Restaurant
from apps.tables.models import ActiveTableSession, RestaurantTable
from apps.tables.services import create_customer_session
from apps.users.models import User


class PublicCartOrderApiTests(APITestCase):
    def setUp(self):
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
        self.customer_session = create_customer_session(table=self.table)
        self.client.cookies["customer_session_key"] = str(
            self.customer_session.session_key
        )
        self.cart_url = reverse("public-cart", args=(self.table.qr_token,))
        self.cart_item_create_url = reverse(
            "public-cart-item-create",
            args=(self.table.qr_token,),
        )
        self.orders_url = reverse(
            "public-orders",
            args=(self.table.qr_token,),
        )

    def create_order(self, customer_session=None, quantity=1, comment=""):
        customer_session = customer_session or self.customer_session
        add_cart_item(
            customer_session,
            self.menu_item,
            quantity=quantity,
            comment=comment,
        )
        return create_order_from_cart(customer_session)

    def close_customer_visit(self):
        order = self.create_order()
        admin = User.objects.create_user(
            username="close-admin",
            role=User.Role.ADMIN,
        )
        for next_status in (
            Order.Status.PREPARING,
            Order.Status.READY,
            Order.Status.DELIVERED,
        ):
            order = change_order_status(order, next_status, admin)
        complete_table_session(order.table_session, admin)
        order.refresh_from_db()
        self.customer_session.refresh_from_db()
        self.table.refresh_from_db()
        return order

    def test_cart_works_without_jwt_with_customer_cookie(self):
        response = self.client.get(self.cart_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_missing_customer_cookie_is_rejected(self):
        del self.client.cookies["customer_session_key"]

        response = self.client.get(self.cart_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("cookie", response.data["detail"].lower())

    def test_invalid_customer_cookie_is_rejected(self):
        self.client.cookies["customer_session_key"] = str(uuid.uuid4())

        response = self.client.get(self.cart_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cookie_from_another_table_session_is_rejected(self):
        other_table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=2,
        )
        other_customer = create_customer_session(table=other_table)
        self.client.cookies["customer_session_key"] = str(
            other_customer.session_key
        )

        response = self.client.get(self.cart_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_qr_token_returns_not_found(self):
        response = self.client.get("/api/public/qr/not-a-uuid/cart/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_inactive_qr_table_returns_not_found(self):
        self.table.is_active = False
        self.table.save(update_fields=("is_active", "updated_at"))

        response = self.client.get(self.cart_url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_cart_returns_items_and_total(self):
        add_cart_item(self.customer_session, self.menu_item, quantity=2)

        response = self.client.get(self.cart_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["menu_item"], self.menu_item.pk)
        self.assertEqual(response.data["items"][0]["line_total"], "500.00")
        self.assertEqual(response.data["total"], "500.00")

    def test_post_cart_item_adds_item(self):
        response = self.client.post(
            self.cart_item_create_url,
            {"menu_item": self.menu_item.pk, "quantity": 2},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            CartItem.objects.filter(
                customer_session=self.customer_session,
                menu_item=self.menu_item,
                quantity=2,
            ).exists()
        )
        self.table.refresh_from_db()
        self.customer_session.refresh_from_db()
        self.assertEqual(self.table.status, RestaurantTable.Status.FREE)
        self.assertIsNone(self.customer_session.active_table_session)
        self.assertFalse(ActiveTableSession.objects.exists())

    def test_post_cart_item_merges_same_item_and_comment(self):
        data = {
            "menu_item": self.menu_item.pk,
            "quantity": 1,
            "comment": "Пиязсыз",
        }
        self.client.post(self.cart_item_create_url, data)

        response = self.client.post(self.cart_item_create_url, data)

        cart_item = CartItem.objects.get(customer_session=self.customer_session)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(cart_item.quantity, 2)
        self.assertEqual(CartItem.objects.count(), 1)

    def test_patch_cart_item_updates_quantity(self):
        cart_item = add_cart_item(self.customer_session, self.menu_item)
        url = reverse(
            "public-cart-item-detail",
            args=(self.table.qr_token, cart_item.pk),
        )

        response = self.client.patch(url, {"quantity": 4})

        cart_item.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(cart_item.quantity, 4)

    def test_patch_cart_item_updates_comment(self):
        cart_item = add_cart_item(self.customer_session, self.menu_item)
        url = reverse(
            "public-cart-item-detail",
            args=(self.table.qr_token, cart_item.pk),
        )

        response = self.client.patch(url, {"comment": "  Пиязсыз  "})

        cart_item.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(cart_item.comment, "Пиязсыз")
        self.assertEqual(response.data["comment"], "Пиязсыз")

    def test_patch_cart_item_rejects_overlong_comment(self):
        cart_item = add_cart_item(self.customer_session, self.menu_item)
        url = reverse(
            "public-cart-item-detail",
            args=(self.table.qr_token, cart_item.pk),
        )

        response = self.client.patch(url, {"comment": "a" * 301})

        cart_item.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(cart_item.comment, "")

    def test_delete_cart_item_removes_item(self):
        cart_item = add_cart_item(self.customer_session, self.menu_item)
        item_id = cart_item.pk
        url = reverse(
            "public-cart-item-detail",
            args=(self.table.qr_token, item_id),
        )

        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(CartItem.objects.filter(pk=item_id).exists())

    def test_customer_cannot_update_or_delete_another_customers_item(self):
        other_customer = create_customer_session(table=self.table)
        other_item = add_cart_item(other_customer, self.menu_item)
        url = reverse(
            "public-cart-item-detail",
            args=(self.table.qr_token, other_item.pk),
        )

        patch_response = self.client.patch(url, {"quantity": 2})
        delete_response = self.client.delete(url)

        self.assertEqual(patch_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(delete_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(CartItem.objects.filter(pk=other_item.pk).exists())

    def test_invalid_menu_items_are_rejected(self):
        unavailable_item = MenuItem.objects.create(
            restaurant=self.restaurant,
            category=self.category,
            name_ky="Жок",
            name_ru="Нет",
            price=Decimal("10.00"),
            is_available=False,
        )
        hidden_item = MenuItem.objects.create(
            restaurant=self.restaurant,
            category=self.category,
            name_ky="Жашыруун",
            name_ru="Скрыто",
            price=Decimal("10.00"),
            is_visible=False,
        )
        deleted_item = MenuItem.objects.create(
            restaurant=self.restaurant,
            category=self.category,
            name_ky="Өчүрүлгөн",
            name_ru="Удалено",
            price=Decimal("10.00"),
            is_deleted=True,
        )
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
            price=Decimal("10.00"),
        )

        for menu_item in (
            unavailable_item,
            hidden_item,
            deleted_item,
            other_item,
        ):
            with self.subTest(menu_item=menu_item.pk):
                response = self.client.post(
                    self.cart_item_create_url,
                    {"menu_item": menu_item.pk},
                )
                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )

    def test_unavailable_menu_item_cannot_be_added_to_cart(self):
        self.menu_item.is_available = False
        self.menu_item.save(update_fields=("is_available", "updated_at"))

        response = self.client.post(
            self.cart_item_create_url,
            {"menu_item": self.menu_item.pk},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            CartItem.objects.filter(customer_session=self.customer_session).exists()
        )

    def test_post_orders_creates_order_from_cart(self):
        add_cart_item(
            self.customer_session,
            self.menu_item,
            quantity=2,
            comment="Пиязсыз",
        )

        response = self.client.post(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["total_amount"], "500.00")
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(
            response.data["items"][0]["name_ky_at_order"],
            self.menu_item.name_ky,
        )
        self.assertEqual(response.data["items"][0]["comment"], "Пиязсыз")

        order = Order.objects.get(pk=response.data["id"])
        self.table.refresh_from_db()
        self.customer_session.refresh_from_db()
        self.assertEqual(self.table.status, RestaurantTable.Status.OCCUPIED)
        self.assertEqual(
            self.customer_session.active_table_session_id,
            order.table_session_id,
        )
        self.assertEqual(ActiveTableSession.objects.count(), 1)

    def test_post_orders_clears_cart_after_success(self):
        add_cart_item(self.customer_session, self.menu_item)

        self.client.post(self.orders_url)

        self.assertFalse(
            CartItem.objects.filter(customer_session=self.customer_session).exists()
        )

    def test_post_orders_rejects_empty_cart(self):
        response = self.client.post(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, RestaurantTable.Status.FREE)
        self.assertFalse(ActiveTableSession.objects.exists())

    def test_post_orders_rejects_item_that_became_unavailable(self):
        cart_item = add_cart_item(self.customer_session, self.menu_item)
        self.menu_item.is_available = False
        self.menu_item.save(update_fields=("is_available", "updated_at"))

        response = self.client.post(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Order.objects.exists())
        self.assertTrue(CartItem.objects.filter(pk=cart_item.pk).exists())

    def test_available_menu_item_can_still_be_ordered(self):
        response = self.client.post(
            self.cart_item_create_url,
            {"menu_item": self.menu_item.pk},
        )
        order_response = self.client.post(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(order_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Order.objects.count(), 1)

    def test_get_orders_returns_current_customer_orders(self):
        order = self.create_order()

        response = self.client.get(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["id"] for item in response.data["orders"]],
            [order.pk],
        )

    def test_closed_session_can_read_completed_order(self):
        order = self.close_customer_visit()

        response = self.client.get(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["read_only"])
        self.assertEqual(response.data["orders"][0]["id"], order.pk)
        self.assertEqual(
            response.data["orders"][0]["status"],
            Order.Status.COMPLETED,
        )
        self.assertEqual(self.table.status, RestaurantTable.Status.FREE)

    def test_closed_session_order_polling_remains_read_only(self):
        order = self.close_customer_visit()

        first_response = self.client.get(self.orders_url)
        second_response = self.client.get(self.orders_url)

        for response in (first_response, second_response):
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(
                [item["id"] for item in response.data["orders"]],
                [order.pk],
            )

    def test_closed_session_cannot_add_cart_item(self):
        self.close_customer_visit()

        response = self.client.post(
            self.cart_item_create_url,
            {"menu_item": self.menu_item.pk, "quantity": 1},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            CartItem.objects.filter(
                customer_session=self.customer_session
            ).exists()
        )

    def test_closed_session_cannot_create_waiter_call(self):
        self.close_customer_visit()
        waiter_call_url = reverse(
            "public-waiter-call-create",
            args=(self.table.qr_token,),
        )

        response = self.client.post(
            waiter_call_url,
            {"reason": WaiterCall.Reason.WAITER_NEEDED},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            WaiterCall.objects.filter(
                customer_session=self.customer_session
            ).exists()
        )

    def test_closed_session_cart_read_is_empty_for_menu_reload(self):
        self.close_customer_visit()

        response = self.client.get(self.cart_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"items": [], "total": "0.00"})

    def test_closed_history_reload_reuses_cookie_without_reopening_table(self):
        order = self.close_customer_visit()
        customer_session_count = self.table.customer_sessions.count()
        table_session_count = self.table.sessions.count()
        session_url = reverse(
            "public-customer-session",
            args=(self.table.qr_token,),
        )

        session_response = self.client.post(session_url)
        orders_response = self.client.get(self.orders_url)

        self.table.refresh_from_db()
        self.assertEqual(session_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            session_response.data["customer_session_id"],
            self.customer_session.pk,
        )
        self.assertTrue(session_response.data["read_only"])
        self.assertEqual(
            self.table.customer_sessions.count(),
            customer_session_count,
        )
        self.assertEqual(self.table.sessions.count(), table_session_count)
        self.assertFalse(
            self.table.sessions.filter(
                status=ActiveTableSession.Status.ACTIVE
            ).exists()
        )
        self.assertEqual(self.table.status, RestaurantTable.Status.FREE)
        self.assertEqual(
            [item["id"] for item in orders_response.data["orders"]],
            [order.pk],
        )

    def test_fresh_browsing_context_does_not_hide_closed_visit_history(self):
        order = self.close_customer_visit()
        fresh_client = APIClient()
        session_url = reverse(
            "public-customer-session",
            args=(self.table.qr_token,),
        )

        fresh_response = fresh_client.post(session_url)
        history_response = self.client.get(self.orders_url)

        self.table.refresh_from_db()
        self.assertEqual(fresh_response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(
            fresh_response.data["customer_session_id"],
            self.customer_session.pk,
        )
        self.assertIsNone(fresh_response.data["table_session_id"])
        self.assertEqual(
            [item["id"] for item in history_response.data["orders"]],
            [order.pk],
        )
        self.assertEqual(self.table.status, RestaurantTable.Status.FREE)
        self.assertFalse(
            self.table.sessions.filter(
                status=ActiveTableSession.Status.ACTIVE
            ).exists()
        )

    def test_get_orders_excludes_other_customer_orders(self):
        own_order = self.create_order()
        other_customer = create_customer_session(table=self.table)
        other_order = self.create_order(other_customer)

        response = self.client.get(self.orders_url)

        order_ids = [item["id"] for item in response.data["orders"]]
        self.assertIn(own_order.pk, order_ids)
        self.assertNotIn(other_order.pk, order_ids)

    def test_additional_order_reuses_existing_active_table_session(self):
        first_order = self.create_order()
        additional_customer = create_customer_session(table=self.table)
        second_order = self.create_order(additional_customer, quantity=2)

        self.assertEqual(
            second_order.table_session_id,
            first_order.table_session_id,
        )
        self.assertEqual(ActiveTableSession.objects.count(), 1)

    def test_checkout_order_is_visible_to_kitchen(self):
        kitchen = User.objects.create_user(
            username="kitchen",
            role=User.Role.KITCHEN,
        )
        order = self.create_order()
        self.client.force_authenticate(user=kitchen)

        response = self.client.get(reverse("kitchen-orders"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(order.pk, [item["id"] for item in response.data])

    def test_get_orders_returns_non_cancelled_total(self):
        active_order = self.create_order(quantity=1)
        cancelled_order = self.create_order(quantity=2)
        cancelled_order.status = Order.Status.CANCELLED
        cancelled_order.save(update_fields=("status", "updated_at"))

        response = self.client.get(self.orders_url)

        self.assertEqual(response.data["total_amount"], "250.00")
        self.assertEqual(len(response.data["orders"]), 2)
        self.assertEqual(active_order.total_amount, Decimal("250.00"))
