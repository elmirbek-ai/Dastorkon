from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.menu.models import (
    Category,
    MenuItem,
    MenuItemModifierGroup,
    MenuItemModifierOption,
)
from apps.orders.models import CartItem, Order
from apps.orders.services import assign_waiter_to_table_session
from apps.restaurants.models import Restaurant
from apps.tables.models import RestaurantTable
from apps.tables.services import (
    create_customer_session,
    get_or_create_active_table_session,
)
from apps.users.models import User, WaiterShift


class OrderModifierApiTests(APITestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Dastorkon")
        self.category = Category.objects.create(
            restaurant=self.restaurant,
            name_ky="Main",
            name_ru="Main",
        )
        self.menu_item = MenuItem.objects.create(
            restaurant=self.restaurant,
            category=self.category,
            name_ky="Burger",
            name_ru="Burger",
            price=Decimal("200.00"),
        )
        self.single_group = MenuItemModifierGroup.objects.create(
            menu_item=self.menu_item,
            name_ky="Portion",
            name_ru="Portion",
            selection_type=MenuItemModifierGroup.SelectionType.SINGLE,
            is_required=True,
            min_selected=1,
            max_selected=1,
        )
        self.standard = MenuItemModifierOption.objects.create(
            group=self.single_group,
            name_ky="Standard",
            name_ru="Standard",
        )
        self.large = MenuItemModifierOption.objects.create(
            group=self.single_group,
            name_ky="Large",
            name_ru="Large",
            price_delta=Decimal("80.00"),
        )
        self.multiple_group = MenuItemModifierGroup.objects.create(
            menu_item=self.menu_item,
            name_ky="Extras",
            name_ru="Extras",
            selection_type=MenuItemModifierGroup.SelectionType.MULTIPLE,
            max_selected=2,
            sort_order=1,
        )
        self.cheese = MenuItemModifierOption.objects.create(
            group=self.multiple_group,
            name_ky="Cheese",
            name_ru="Cheese",
            price_delta=Decimal("30.00"),
        )
        self.sauce = MenuItemModifierOption.objects.create(
            group=self.multiple_group,
            name_ky="Sauce",
            name_ru="Sauce",
            price_delta=Decimal("20.00"),
        )
        self.fries = MenuItemModifierOption.objects.create(
            group=self.multiple_group,
            name_ky="Fries",
            name_ru="Fries",
            price_delta=Decimal("70.00"),
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
        self.cart_create_url = reverse(
            "public-cart-item-create",
            args=(self.table.qr_token,),
        )
        self.cart_url = reverse("public-cart", args=(self.table.qr_token,))
        self.orders_url = reverse("public-orders", args=(self.table.qr_token,))

    def selected_modifiers(self, single=None, multiple=None):
        selections = [
            {
                "group_id": self.single_group.pk,
                "option_ids": [(single or self.standard).pk],
            }
        ]
        if multiple:
            selections.append(
                {
                    "group_id": self.multiple_group.pk,
                    "option_ids": [option.pk for option in multiple],
                }
            )
        return selections

    def add_to_cart(self, selected_modifiers=None, quantity=1):
        return self.client.post(
            self.cart_create_url,
            {
                "menu_item": self.menu_item.pk,
                "quantity": quantity,
                "selected_modifiers": (
                    selected_modifiers
                    if selected_modifiers is not None
                    else self.selected_modifiers()
                ),
            },
            format="json",
        )

    def test_customer_can_add_required_single_modifier_and_price_is_included(self):
        response = self.add_to_cart(
            self.selected_modifiers(self.large, [self.cheese]),
            quantity=2,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["modifier_price"], "110.00")
        self.assertEqual(response.data["unit_price"], "310.00")
        self.assertEqual(response.data["line_total"], "620.00")
        self.assertEqual(
            response.data["selected_modifiers"][0]["option_ids"],
            [self.large.pk],
        )

    def test_customer_missing_required_modifier_is_rejected(self):
        response = self.add_to_cart([])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CartItem.objects.exists())

    def test_unknown_group_and_wrong_option_are_rejected(self):
        other_item = MenuItem.objects.create(
            restaurant=self.restaurant,
            category=self.category,
            name_ky="Tea",
            name_ru="Tea",
            price=Decimal("50.00"),
        )
        other_group = MenuItemModifierGroup.objects.create(
            menu_item=other_item,
            name_ky="Sugar",
            name_ru="Sugar",
            selection_type=MenuItemModifierGroup.SelectionType.SINGLE,
        )
        other_option = MenuItemModifierOption.objects.create(
            group=other_group,
            name_ky="No sugar",
            name_ru="No sugar",
        )

        group_response = self.add_to_cart(
            [{"group_id": other_group.pk, "option_ids": [other_option.pk]}]
        )
        option_response = self.add_to_cart(
            [
                {
                    "group_id": self.single_group.pk,
                    "option_ids": [other_option.pk],
                }
            ]
        )

        self.assertEqual(group_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(option_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_multiple_limits_and_duplicate_options_are_rejected(self):
        too_many = self.add_to_cart(
            self.selected_modifiers(
                multiple=[self.cheese, self.sauce, self.fries]
            )
        )
        duplicate = self.add_to_cart(
            [
                {
                    "group_id": self.single_group.pk,
                    "option_ids": [self.standard.pk],
                },
                {
                    "group_id": self.multiple_group.pk,
                    "option_ids": [self.cheese.pk, self.cheese.pk],
                },
            ]
        )
        self.multiple_group.min_selected = 2
        self.multiple_group.save(update_fields=("min_selected", "updated_at"))
        too_few = self.add_to_cart(
            self.selected_modifiers(multiple=[self.cheese])
        )

        self.assertEqual(too_many.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(too_few.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unavailable_modifier_option_is_rejected(self):
        self.cheese.is_available = False
        self.cheese.save(update_fields=("is_available", "updated_at"))

        response = self.add_to_cart(
            self.selected_modifiers(multiple=[self.cheese])
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_same_item_with_different_modifiers_creates_separate_cart_lines(self):
        first = self.add_to_cart(self.selected_modifiers(self.standard))
        second = self.add_to_cart(self.selected_modifiers(self.large))
        merged = self.add_to_cart(self.selected_modifiers(self.standard))

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(merged.status_code, status.HTTP_201_CREATED)
        self.assertEqual(CartItem.objects.count(), 2)
        self.assertEqual(
            sorted(CartItem.objects.values_list("quantity", flat=True)),
            [1, 2],
        )

    def test_order_snapshots_modifier_names_prices_and_totals(self):
        self.add_to_cart(
            self.selected_modifiers(self.large, [self.cheese]),
            quantity=2,
        )

        response = self.client.post(self.orders_url)

        order = Order.objects.get(pk=response.data["id"])
        snapshots = order.items.get().modifiers.all()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(order.total_amount, Decimal("620.00"))
        self.assertEqual(len(response.data["items"][0]["modifiers"]), 2)
        self.assertEqual(
            sum(snapshot.price_delta for snapshot in snapshots),
            Decimal("110.00"),
        )

        self.large.name_ky = "Changed"
        self.large.price_delta = Decimal("120.00")
        self.large.save(update_fields=("name_ky", "price_delta", "updated_at"))
        snapshot = snapshots.get(option_name_ru="Large")
        self.assertEqual(snapshot.option_name_ky, "Large")
        self.assertEqual(snapshot.price_delta, Decimal("80.00"))

    def test_order_views_expose_modifier_snapshots(self):
        waiter = User.objects.create_user(
            username="waiter-modifiers",
            role=User.Role.WAITER,
        )
        kitchen = User.objects.create_user(
            username="kitchen-modifiers",
            role=User.Role.KITCHEN,
        )
        admin = User.objects.create_user(
            username="admin-modifiers",
            role=User.Role.ADMIN,
        )
        WaiterShift.objects.create(waiter=waiter)
        assign_waiter_to_table_session(self.table_session, waiter)
        self.add_to_cart(self.selected_modifiers(self.large))
        order_response = self.client.post(self.orders_url)
        order_id = order_response.data["id"]

        public_response = self.client.get(self.orders_url)
        self.client.force_authenticate(waiter)
        waiter_response = self.client.get(reverse("waiter-orders"))
        self.client.force_authenticate(kitchen)
        kitchen_response = self.client.get(reverse("kitchen-orders"))
        self.client.force_authenticate(admin)
        admin_response = self.client.get(
            reverse("admin-order-detail", args=(order_id,))
        )

        responses = (
            public_response.data["orders"][0],
            waiter_response.data[0],
            kitchen_response.data[0],
            admin_response.data,
        )
        for order_data in responses:
            with self.subTest(order_data=order_data["id"]):
                self.assertEqual(
                    order_data["items"][0]["modifiers"][0]["option_name_ru"],
                    "Large",
                )

    def test_waiter_manual_order_accepts_modifiers_and_includes_price(self):
        waiter = User.objects.create_user(
            username="manual-modifiers",
            role=User.Role.WAITER,
        )
        WaiterShift.objects.create(waiter=waiter)
        self.client.force_authenticate(waiter)

        response = self.client.post(
            reverse("waiter-manual-order-create"),
            {
                "table_id": self.table.pk,
                "items": [
                    {
                        "menu_item_id": self.menu_item.pk,
                        "quantity": 2,
                        "selected_modifiers": self.selected_modifiers(
                            self.large,
                            [self.sauce],
                        ),
                    }
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["total_amount"], "600.00")
        self.assertEqual(len(response.data["items"][0]["modifiers"]), 2)
