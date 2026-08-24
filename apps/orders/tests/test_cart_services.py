from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.menu.models import Category, MenuItem
from apps.orders.models import CartItem, Order
from apps.orders.services import (
    add_cart_item,
    calculate_cart_total,
    clear_cart,
    create_order_from_cart,
    remove_cart_item,
    update_cart_item,
)
from apps.restaurants.models import Restaurant
from apps.tables.models import RestaurantTable
from apps.tables.services import (
    create_customer_session,
    get_or_create_active_table_session,
)


class CartServicesTests(TestCase):
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
        self.second_menu_item = MenuItem.objects.create(
            restaurant=self.restaurant,
            category=self.category,
            name_ky="Манты",
            name_ru="Манты",
            price=Decimal("150.00"),
        )
        self.table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=1,
        )
        self.table_session = get_or_create_active_table_session(self.table)
        self.customer_session = create_customer_session(self.table_session)

    def test_add_cart_item_creates_cart_item(self):
        cart_item = add_cart_item(
            self.customer_session,
            self.menu_item,
            quantity=2,
            comment="  Пиязсыз  ",
        )

        self.assertEqual(cart_item.customer_session, self.customer_session)
        self.assertEqual(cart_item.menu_item, self.menu_item)
        self.assertEqual(cart_item.quantity, 2)
        self.assertEqual(cart_item.comment, "Пиязсыз")

    def test_add_cart_item_merges_same_item_and_comment(self):
        first_item = add_cart_item(
            self.customer_session,
            self.menu_item,
            quantity=1,
            comment="Пиязсыз",
        )

        second_item = add_cart_item(
            self.customer_session,
            self.menu_item,
            quantity=2,
            comment="Пиязсыз",
        )

        self.assertEqual(second_item.pk, first_item.pk)
        self.assertEqual(second_item.quantity, 3)
        self.assertEqual(CartItem.objects.count(), 1)

    def test_add_cart_item_keeps_different_comments_separate(self):
        add_cart_item(
            self.customer_session,
            self.menu_item,
            comment="Пиязсыз",
        )
        add_cart_item(
            self.customer_session,
            self.menu_item,
            comment="Ачуусуз",
        )

        self.assertEqual(CartItem.objects.count(), 2)

    def test_add_cart_item_rejects_non_positive_quantity(self):
        for quantity in (0, -1):
            with self.subTest(quantity=quantity):
                with self.assertRaises(ValidationError):
                    add_cart_item(
                        self.customer_session,
                        self.menu_item,
                        quantity=quantity,
                    )

    def test_add_cart_item_rejects_unavailable_menu_item(self):
        self.menu_item.is_available = False
        self.menu_item.save(update_fields=("is_available", "updated_at"))

        with self.assertRaises(ValidationError):
            add_cart_item(self.customer_session, self.menu_item)

    def test_add_cart_item_rejects_hidden_menu_item(self):
        self.menu_item.is_visible = False
        self.menu_item.save(update_fields=("is_visible", "updated_at"))

        with self.assertRaises(ValidationError):
            add_cart_item(self.customer_session, self.menu_item)

    def test_add_cart_item_rejects_deleted_menu_item(self):
        self.menu_item.is_deleted = True
        self.menu_item.save(update_fields=("is_deleted", "updated_at"))

        with self.assertRaises(ValidationError):
            add_cart_item(self.customer_session, self.menu_item)

    def test_add_cart_item_rejects_item_from_another_restaurant(self):
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
            add_cart_item(self.customer_session, other_item)

    def test_update_cart_item_changes_quantity(self):
        cart_item = add_cart_item(self.customer_session, self.menu_item)

        cart_item = update_cart_item(cart_item, quantity=4)

        self.assertEqual(cart_item.quantity, 4)

    def test_update_cart_item_changes_comment(self):
        cart_item = add_cart_item(self.customer_session, self.menu_item)

        cart_item = update_cart_item(cart_item, comment="  Пиязсыз  ")

        self.assertEqual(cart_item.comment, "Пиязсыз")

    def test_update_cart_item_rejects_overlong_comment(self):
        cart_item = add_cart_item(self.customer_session, self.menu_item)

        with self.assertRaises(ValidationError):
            update_cart_item(cart_item, comment="a" * 301)

    def test_update_cart_item_rejects_non_positive_quantity(self):
        cart_item = add_cart_item(self.customer_session, self.menu_item)

        for quantity in (0, -1):
            with self.subTest(quantity=quantity):
                with self.assertRaises(ValidationError):
                    update_cart_item(cart_item, quantity=quantity)

    def test_remove_cart_item_deletes_item(self):
        cart_item = add_cart_item(self.customer_session, self.menu_item)

        result = remove_cart_item(cart_item)

        self.assertIsNone(result)
        self.assertFalse(CartItem.objects.filter(pk=cart_item.pk).exists())

    def test_calculate_cart_total_returns_decimal_total(self):
        add_cart_item(self.customer_session, self.menu_item, quantity=2)
        add_cart_item(self.customer_session, self.second_menu_item, quantity=3)

        total = calculate_cart_total(self.customer_session)

        self.assertEqual(total, Decimal("950.00"))
        self.assertIsInstance(total, Decimal)

    def test_clear_cart_deletes_customer_session_items(self):
        add_cart_item(self.customer_session, self.menu_item)
        add_cart_item(self.customer_session, self.second_menu_item)

        clear_cart(self.customer_session)

        self.assertFalse(
            CartItem.objects.filter(customer_session=self.customer_session).exists()
        )

    def test_create_order_from_cart_creates_order_with_correct_total(self):
        add_cart_item(self.customer_session, self.menu_item, quantity=2)
        add_cart_item(self.customer_session, self.second_menu_item, quantity=1)

        order = create_order_from_cart(self.customer_session)

        self.assertEqual(order.total_amount, Decimal("650.00"))
        self.assertEqual(order.items.count(), 2)
        self.assertEqual(order.source, Order.Source.CUSTOMER_QR)

    def test_create_order_from_cart_creates_snapshot_fields(self):
        add_cart_item(
            self.customer_session,
            self.menu_item,
            quantity=2,
            comment="Пиязсыз",
        )

        order = create_order_from_cart(self.customer_session)

        order_item = order.items.get()
        self.assertEqual(order_item.name_ky_at_order, "Палоо")
        self.assertEqual(order_item.name_ru_at_order, "Плов")
        self.assertEqual(order_item.price_at_order, Decimal("250.00"))
        self.assertEqual(order_item.comment, "Пиязсыз")

    def test_create_order_from_cart_clears_cart(self):
        add_cart_item(self.customer_session, self.menu_item)

        create_order_from_cart(self.customer_session)

        self.assertFalse(
            CartItem.objects.filter(customer_session=self.customer_session).exists()
        )

    def test_create_order_from_cart_rejects_empty_cart(self):
        with self.assertRaises(ValidationError):
            create_order_from_cart(self.customer_session)

    def test_create_order_from_cart_keeps_cart_if_order_creation_fails(self):
        cart_item = add_cart_item(self.customer_session, self.menu_item)
        self.menu_item.is_available = False
        self.menu_item.save(update_fields=("is_available", "updated_at"))

        with self.assertRaises(ValidationError):
            create_order_from_cart(self.customer_session)

        self.assertTrue(CartItem.objects.filter(pk=cart_item.pk).exists())

    def test_inactive_customer_session_cannot_add_cart_item(self):
        self.customer_session.is_active = False
        self.customer_session.save(update_fields=("is_active", "updated_at"))

        with self.assertRaises(ValidationError):
            add_cart_item(self.customer_session, self.menu_item)
