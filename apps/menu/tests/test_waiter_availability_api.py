from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.menu.models import Category, MenuItem
from apps.restaurants.models import Restaurant
from apps.users.models import User


class WaiterMenuAvailabilityApiTests(APITestCase):
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
        self.waiter = User.objects.create_user(
            username="waiter-availability",
            password="test-pass",
            role=User.Role.WAITER,
        )
        self.kitchen = User.objects.create_user(
            username="kitchen-availability",
            password="test-pass",
            role=User.Role.KITCHEN,
        )
        self.list_url = reverse("waiter-menu-item-list")
        self.availability_url = reverse(
            "waiter-menu-item-availability",
            args=(self.menu_item.pk,),
        )
        self.admin_detail_url = reverse(
            "admin-menu-item-detail",
            args=(self.menu_item.pk,),
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_waiter_can_list_menu_items(self):
        self.authenticate(self.waiter)
        self.menu_item.is_hit = True
        self.menu_item.cooking_time_min = 15
        self.menu_item.save(update_fields=("is_hit", "cooking_time_min", "updated_at"))

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in response.data], [self.menu_item.pk])
        self.assertEqual(response.data[0]["category_name_ky"], self.category.name_ky)
        self.assertTrue(response.data[0]["is_hit"])
        self.assertEqual(response.data[0]["cooking_time_min"], 15)

    def test_waiter_can_change_availability(self):
        self.authenticate(self.waiter)

        response = self.client.patch(
            self.availability_url,
            {"is_available": False},
        )

        self.menu_item.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(self.menu_item.is_available)
        self.assertFalse(response.data["is_available"])

    def test_waiter_cannot_change_protected_menu_fields(self):
        self.authenticate(self.waiter)
        original_category_id = self.menu_item.category_id
        original_restaurant_id = self.menu_item.restaurant_id

        response = self.client.patch(
            self.availability_url,
            {
                "is_available": False,
                "name_ky": "Өзгөртүлдү",
                "price": "1.00",
                "category": 999,
                "restaurant": 999,
                "is_visible": False,
                "is_hit": True,
                "is_new": True,
                "is_spicy": True,
                "is_vegetarian": True,
                "is_recommended": True,
                "cooking_time_min": 15,
                "modifier_groups": [],
            },
        )

        self.menu_item.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(self.menu_item.is_available)
        self.assertEqual(self.menu_item.name_ky, "Палоо")
        self.assertEqual(self.menu_item.price, Decimal("250.00"))
        self.assertEqual(self.menu_item.category_id, original_category_id)
        self.assertEqual(self.menu_item.restaurant_id, original_restaurant_id)
        self.assertTrue(self.menu_item.is_visible)
        self.assertFalse(self.menu_item.is_hit)
        self.assertFalse(self.menu_item.is_new)
        self.assertFalse(self.menu_item.is_spicy)
        self.assertFalse(self.menu_item.is_vegetarian)
        self.assertFalse(self.menu_item.is_recommended)
        self.assertIsNone(self.menu_item.cooking_time_min)

    def test_waiter_cannot_use_admin_menu_item_update(self):
        self.authenticate(self.waiter)

        response = self.client.patch(
            self.admin_detail_url,
            {"price": "1.00", "is_available": False},
        )

        self.menu_item.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.menu_item.price, Decimal("250.00"))
        self.assertTrue(self.menu_item.is_available)

    def test_kitchen_cannot_list_or_change_availability(self):
        self.authenticate(self.kitchen)

        list_response = self.client.get(self.list_url)
        update_response = self.client.patch(
            self.availability_url,
            {"is_available": False},
        )

        self.menu_item.refresh_from_db()
        self.assertEqual(list_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(self.menu_item.is_available)
