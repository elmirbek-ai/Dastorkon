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
from apps.restaurants.models import Restaurant
from apps.users.models import User


class MenuItemModifierAdminApiTests(APITestCase):
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
            name_ky="Lagman",
            name_ru="Lagman",
            price=Decimal("250.00"),
        )
        self.group = MenuItemModifierGroup.objects.create(
            menu_item=self.menu_item,
            name_ky="Spiciness",
            name_ru="Spiciness",
            selection_type=MenuItemModifierGroup.SelectionType.SINGLE,
        )
        self.option = MenuItemModifierOption.objects.create(
            group=self.group,
            name_ky="Medium",
            name_ru="Medium",
        )
        self.admin = User.objects.create_user(
            username="modifier-admin",
            role=User.Role.ADMIN,
        )
        self.waiter = User.objects.create_user(
            username="modifier-waiter",
            role=User.Role.WAITER,
        )
        self.kitchen = User.objects.create_user(
            username="modifier-kitchen",
            role=User.Role.KITCHEN,
        )
        self.group_list_url = reverse(
            "admin-menu-item-modifier-group-list",
            args=(self.menu_item.pk,),
        )
        self.group_detail_url = reverse(
            "admin-modifier-group-detail",
            args=(self.group.pk,),
        )
        self.option_list_url = reverse(
            "admin-modifier-group-option-list",
            args=(self.group.pk,),
        )
        self.option_detail_url = reverse(
            "admin-modifier-option-detail",
            args=(self.option.pk,),
        )

    def authenticate_admin(self):
        self.client.force_authenticate(user=self.admin)

    def group_payload(self, **overrides):
        payload = {
            "name_ky": "Portion",
            "name_ru": "Portion",
            "selection_type": MenuItemModifierGroup.SelectionType.SINGLE,
            "is_required": True,
            "min_selected": 1,
            "max_selected": 1,
            "sort_order": 2,
        }
        payload.update(overrides)
        return payload

    def test_admin_can_create_modifier_group_for_menu_item(self):
        self.authenticate_admin()

        response = self.client.post(
            self.group_list_url,
            self.group_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = MenuItemModifierGroup.objects.get(pk=response.data["id"])
        self.assertEqual(created.menu_item, self.menu_item)
        self.assertTrue(created.is_required)
        self.assertEqual(created.effective_max_selected, 1)

    def test_admin_can_update_modifier_group(self):
        self.authenticate_admin()

        response = self.client.patch(
            self.group_detail_url,
            {
                "selection_type": MenuItemModifierGroup.SelectionType.MULTIPLE,
                "is_required": True,
                "min_selected": 1,
                "max_selected": 3,
            },
            format="json",
        )

        self.group.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.group.selection_type,
            MenuItemModifierGroup.SelectionType.MULTIPLE,
        )
        self.assertEqual(self.group.max_selected, 3)

    def test_admin_delete_soft_deactivates_modifier_group(self):
        self.authenticate_admin()

        response = self.client.delete(self.group_detail_url)

        self.group.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(self.group.is_active)
        self.assertTrue(
            MenuItemModifierGroup.objects.filter(pk=self.group.pk).exists()
        )

    def test_admin_can_create_modifier_option(self):
        self.authenticate_admin()

        response = self.client.post(
            self.option_list_url,
            {
                "name_ky": "Large",
                "name_ru": "Large",
                "price_delta": "80.00",
                "sort_order": 1,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        option = MenuItemModifierOption.objects.get(pk=response.data["id"])
        self.assertEqual(option.group, self.group)
        self.assertEqual(option.price_delta, Decimal("80.00"))

    def test_admin_can_update_option_price_and_availability(self):
        self.authenticate_admin()

        response = self.client.patch(
            self.option_detail_url,
            {"price_delta": "30.00", "is_available": False},
            format="json",
        )

        self.option.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.option.price_delta, Decimal("30.00"))
        self.assertFalse(self.option.is_available)

    def test_admin_delete_soft_deactivates_modifier_option(self):
        self.authenticate_admin()

        response = self.client.delete(self.option_detail_url)

        self.option.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(self.option.is_active)
        self.assertTrue(
            MenuItemModifierOption.objects.filter(pk=self.option.pk).exists()
        )

    def test_admin_menu_item_response_includes_modifier_groups(self):
        self.authenticate_admin()

        response = self.client.get(
            reverse("admin-menu-item-detail", args=(self.menu_item.pk,))
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["modifier_groups"][0]["id"], self.group.pk)
        self.assertEqual(
            response.data["modifier_groups"][0]["options"][0]["id"],
            self.option.pk,
        )

    def test_invalid_group_selection_rules_are_rejected(self):
        self.authenticate_admin()
        invalid_payloads = (
            self.group_payload(min_selected=-1),
            self.group_payload(
                selection_type=MenuItemModifierGroup.SelectionType.MULTIPLE,
                min_selected=2,
                max_selected=1,
            ),
            self.group_payload(max_selected=2),
            self.group_payload(is_required=True, min_selected=0),
            self.group_payload(selection_type="INVALID"),
        )

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                response = self.client.post(
                    self.group_list_url,
                    payload,
                    format="json",
                )

                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )

    def test_negative_option_price_delta_is_rejected(self):
        self.authenticate_admin()

        response = self.client.post(
            self.option_list_url,
            {
                "name_ky": "Discount",
                "name_ru": "Discount",
                "price_delta": "-1.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("price_delta", response.data)

    def assert_modifier_mutations_forbidden(self, user, expected_status):
        self.client.force_authenticate(user=user)
        responses = (
            self.client.post(
                self.group_list_url,
                self.group_payload(),
                format="json",
            ),
            self.client.patch(
                self.group_detail_url,
                {"name_ky": "Changed"},
                format="json",
            ),
            self.client.delete(self.group_detail_url),
            self.client.post(
                self.option_list_url,
                {"name_ky": "Extra", "name_ru": "Extra"},
                format="json",
            ),
            self.client.patch(
                self.option_detail_url,
                {"price_delta": "10.00"},
                format="json",
            ),
            self.client.delete(self.option_detail_url),
        )
        self.assertTrue(
            all(response.status_code == expected_status for response in responses)
        )

    def test_kitchen_cannot_create_update_or_delete_modifiers(self):
        self.assert_modifier_mutations_forbidden(
            self.kitchen,
            status.HTTP_403_FORBIDDEN,
        )

    def test_waiter_cannot_create_update_or_delete_modifiers(self):
        self.assert_modifier_mutations_forbidden(
            self.waiter,
            status.HTTP_403_FORBIDDEN,
        )

    def test_anonymous_customer_cannot_create_update_or_delete_modifiers(self):
        self.assert_modifier_mutations_forbidden(
            None,
            status.HTTP_401_UNAUTHORIZED,
        )
