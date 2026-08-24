import uuid
from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.menu.models import Category, MenuItem
from apps.orders.models import CartItem, Order
from apps.orders.services import add_cart_item, create_order_from_cart
from apps.restaurants.models import Restaurant
from apps.tables.models import RestaurantTable
from apps.tables.services import (
    create_customer_session,
    get_or_create_active_table_session,
)


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
        self.table_session = get_or_create_active_table_session(self.table)
        self.customer_session = create_customer_session(self.table_session)
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
        other_table_session = get_or_create_active_table_session(other_table)
        other_customer = create_customer_session(other_table_session)
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

        response = self.client.patch(url, {"comment": "Пиязсыз"})

        cart_item.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(cart_item.comment, "Пиязсыз")

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
        other_customer = create_customer_session(self.table_session)
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
        add_cart_item(self.customer_session, self.menu_item, quantity=2)

        response = self.client.post(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["total_amount"], "500.00")
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(
            response.data["items"][0]["name_ky_at_order"],
            self.menu_item.name_ky,
        )

    def test_post_orders_clears_cart_after_success(self):
        add_cart_item(self.customer_session, self.menu_item)

        self.client.post(self.orders_url)

        self.assertFalse(
            CartItem.objects.filter(customer_session=self.customer_session).exists()
        )

    def test_post_orders_rejects_empty_cart(self):
        response = self.client.post(self.orders_url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

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

    def test_get_orders_excludes_other_customer_orders(self):
        own_order = self.create_order()
        other_customer = create_customer_session(self.table_session)
        other_order = self.create_order(other_customer)

        response = self.client.get(self.orders_url)

        order_ids = [item["id"] for item in response.data["orders"]]
        self.assertIn(own_order.pk, order_ids)
        self.assertNotIn(other_order.pk, order_ids)

    def test_get_orders_returns_non_cancelled_total(self):
        active_order = self.create_order(quantity=1)
        cancelled_order = self.create_order(quantity=2)
        cancelled_order.status = Order.Status.CANCELLED
        cancelled_order.save(update_fields=("status", "updated_at"))

        response = self.client.get(self.orders_url)

        self.assertEqual(response.data["total_amount"], "250.00")
        self.assertEqual(len(response.data["orders"]), 2)
        self.assertEqual(active_order.total_amount, Decimal("250.00"))
