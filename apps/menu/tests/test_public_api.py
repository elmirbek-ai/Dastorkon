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
from apps.tables.models import RestaurantTable


class PublicMenuApiTests(APITestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Dastorkon")
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
        self.url = reverse("public-menu", args=(self.table.qr_token,))

    def get_item_ids(self, response):
        return [
            item["id"]
            for category in response.data["categories"]
            for item in category["items"]
        ]

    def test_public_menu_works_without_authentication(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["restaurant"]["id"], self.restaurant.pk)

    def test_public_menu_returns_only_qr_table_restaurant_menu(self):
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

        response = self.client.get(self.url)

        self.assertIn(self.menu_item.pk, self.get_item_ids(response))
        self.assertNotIn(other_item.pk, self.get_item_ids(response))

    def test_public_menu_excludes_deleted_categories(self):
        self.category.is_deleted = True
        self.category.save(update_fields=("is_deleted", "updated_at"))

        response = self.client.get(self.url)

        self.assertEqual(response.data["categories"], [])

    def test_public_menu_excludes_hidden_categories(self):
        self.category.is_visible = False
        self.category.save(update_fields=("is_visible", "updated_at"))

        response = self.client.get(self.url)

        self.assertEqual(response.data["categories"], [])

    def test_public_menu_excludes_deleted_menu_items(self):
        self.menu_item.is_deleted = True
        self.menu_item.save(update_fields=("is_deleted", "updated_at"))

        response = self.client.get(self.url)

        self.assertEqual(self.get_item_ids(response), [])

    def test_public_menu_excludes_hidden_menu_items(self):
        self.menu_item.is_visible = False
        self.menu_item.save(update_fields=("is_visible", "updated_at"))

        response = self.client.get(self.url)

        self.assertEqual(self.get_item_ids(response), [])

    def test_public_menu_includes_unavailable_menu_items_with_status(self):
        self.menu_item.is_available = False
        self.menu_item.save(update_fields=("is_available", "updated_at"))

        response = self.client.get(self.url)

        self.assertEqual(self.get_item_ids(response), [self.menu_item.pk])
        item = response.data["categories"][0]["items"][0]
        self.assertFalse(item["is_available"])

    def test_public_menu_exposes_sales_labels_and_prep_time(self):
        self.menu_item.is_hit = True
        self.menu_item.is_new = True
        self.menu_item.is_spicy = True
        self.menu_item.is_vegetarian = True
        self.menu_item.is_recommended = True
        self.menu_item.cooking_time_min = 15
        self.menu_item.save()

        response = self.client.get(self.url)

        item = response.data["categories"][0]["items"][0]
        self.assertTrue(item["is_hit"])
        self.assertTrue(item["is_new"])
        self.assertTrue(item["is_spicy"])
        self.assertTrue(item["is_vegetarian"])
        self.assertTrue(item["is_recommended"])
        self.assertEqual(item["cooking_time_min"], 15)

    def test_public_menu_exposes_only_active_available_modifiers(self):
        active_group = MenuItemModifierGroup.objects.create(
            menu_item=self.menu_item,
            name_ky="Portion",
            name_ru="Portion",
            selection_type=MenuItemModifierGroup.SelectionType.SINGLE,
            sort_order=1,
        )
        available_option = MenuItemModifierOption.objects.create(
            group=active_group,
            name_ky="Standard",
            name_ru="Standard",
            sort_order=1,
        )
        MenuItemModifierOption.objects.create(
            group=active_group,
            name_ky="Unavailable",
            name_ru="Unavailable",
            is_available=False,
        )
        MenuItemModifierOption.objects.create(
            group=active_group,
            name_ky="Inactive",
            name_ru="Inactive",
            is_active=False,
        )
        inactive_group = MenuItemModifierGroup.objects.create(
            menu_item=self.menu_item,
            name_ky="Hidden",
            name_ru="Hidden",
            selection_type=MenuItemModifierGroup.SelectionType.MULTIPLE,
            is_active=False,
        )
        MenuItemModifierOption.objects.create(
            group=inactive_group,
            name_ky="Hidden option",
            name_ru="Hidden option",
        )

        response = self.client.get(self.url)

        item = response.data["categories"][0]["items"][0]
        self.assertEqual(
            [group["id"] for group in item["modifier_groups"]],
            [active_group.pk],
        )
        self.assertEqual(
            [option["id"] for option in item["modifier_groups"][0]["options"]],
            [available_option.pk],
        )

    def test_public_menu_groups_items_under_categories(self):
        drinks = Category.objects.create(
            restaurant=self.restaurant,
            name_ky="Суусундуктар",
            name_ru="Напитки",
            sort_order=2,
        )
        drink = MenuItem.objects.create(
            restaurant=self.restaurant,
            category=drinks,
            name_ky="Чай",
            name_ru="Чай",
            price=Decimal("50.00"),
        )

        response = self.client.get(self.url)

        categories = {
            category["id"]: [item["id"] for item in category["items"]]
            for category in response.data["categories"]
        }
        self.assertEqual(categories[self.category.pk], [self.menu_item.pk])
        self.assertEqual(categories[drinks.pk], [drink.pk])
