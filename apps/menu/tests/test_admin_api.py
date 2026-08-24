from decimal import Decimal
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.menu.models import Category, MenuItem
from apps.restaurants.models import Restaurant
from apps.users.models import User


class AdminMenuApiTests(APITestCase):
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
        self.kitchen = User.objects.create_user(
            username="kitchen",
            password="test-pass",
            role=User.Role.KITCHEN,
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
        self.category_list_url = reverse("admin-category-list")
        self.menu_item_list_url = reverse("admin-menu-item-list")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_anonymous_user_cannot_access_admin_menu_api(self):
        response = self.client.get(self.category_list_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_waiter_cannot_access_admin_menu_api(self):
        self.authenticate(self.waiter)

        response = self.client.get(self.category_list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_kitchen_user_cannot_access_admin_menu_api(self):
        self.authenticate(self.kitchen)

        response = self.client.get(self.category_list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_category(self):
        self.authenticate(self.admin)
        data = {
            "restaurant": self.restaurant.pk,
            "name_ky": "Суусундуктар",
            "name_ru": "Напитки",
            "sort_order": 2,
        }

        response = self.client.post(self.category_list_url, data)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            Category.objects.filter(
                restaurant=self.restaurant,
                name_ky="Суусундуктар",
            ).exists()
        )

    def test_category_without_order_is_appended_after_current_max(self):
        self.authenticate(self.admin)
        self.category.sort_order = 4
        self.category.save(update_fields=("sort_order", "updated_at"))

        response = self.client.post(
            self.category_list_url,
            {
                "restaurant": self.restaurant.pk,
                "name_ky": "Суусундуктар",
                "name_ru": "Напитки",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["sort_order"], 5)

    def test_admin_can_list_categories(self):
        self.authenticate(self.admin)

        response = self.client.get(self.category_list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in response.data], [self.category.pk])

    def test_admin_can_update_category(self):
        self.authenticate(self.admin)
        url = reverse("admin-category-detail", args=(self.category.pk,))
        data = {
            "restaurant": self.restaurant.pk,
            "name_ky": "Жаңыртылган",
            "name_ru": "Обновлено",
            "sort_order": 3,
            "is_visible": True,
            "is_deleted": False,
        }

        response = self.client.put(url, data)

        self.category.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.category.name_ky, "Жаңыртылган")
        self.assertEqual(self.category.sort_order, 3)

    def test_admin_destroy_category_performs_soft_delete(self):
        self.authenticate(self.admin)
        url = reverse("admin-category-detail", args=(self.category.pk,))

        response = self.client.delete(url)

        self.category.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(self.category.is_deleted)
        self.assertFalse(self.category.is_visible)
        self.assertTrue(Category.objects.filter(pk=self.category.pk).exists())

    def test_admin_can_create_menu_item(self):
        self.authenticate(self.admin)
        data = {
            "restaurant": self.restaurant.pk,
            "category": self.category.pk,
            "name_ky": "Манты",
            "name_ru": "Манты",
            "price": "300.00",
        }

        response = self.client.post(self.menu_item_list_url, data)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(MenuItem.objects.filter(name_ky="Манты").exists())

    def test_menu_item_rejects_category_from_another_restaurant(self):
        self.authenticate(self.admin)
        other_restaurant = Restaurant.objects.create(name="Other")
        other_category = Category.objects.create(
            restaurant=other_restaurant,
            name_ky="Башка",
            name_ru="Другое",
        )
        data = {
            "restaurant": self.restaurant.pk,
            "category": other_category.pk,
            "name_ky": "Тамак",
            "name_ru": "Блюдо",
            "price": "100.00",
        }

        response = self.client.post(self.menu_item_list_url, data)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("category", response.data)

    def test_admin_can_update_menu_item(self):
        self.authenticate(self.admin)
        url = reverse("admin-menu-item-detail", args=(self.menu_item.pk,))

        response = self.client.patch(url, {"price": "275.00"})

        self.menu_item.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.menu_item.price, Decimal("275.00"))

    def test_admin_can_change_menu_item_availability(self):
        self.authenticate(self.admin)
        url = reverse("admin-menu-item-detail", args=(self.menu_item.pk,))

        response = self.client.patch(url, {"is_available": False})

        self.menu_item.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(self.menu_item.is_available)

    def test_menu_item_image_is_preserved_when_patch_omits_image(self):
        self.authenticate(self.admin)
        self.menu_item.image.save(
            f"test-preserve-{uuid4()}.gif",
            SimpleUploadedFile(
                "dish.gif",
                b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;",
                content_type="image/gif",
            ),
        )
        image_name = self.menu_item.image.name
        self.addCleanup(self.menu_item.image.storage.delete, image_name)

        response = self.client.patch(
            reverse("admin-menu-item-detail", args=(self.menu_item.pk,)),
            {"price": "275.00"},
        )

        self.menu_item.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.menu_item.image.name, image_name)

    def test_admin_can_remove_menu_item_image(self):
        self.authenticate(self.admin)
        self.menu_item.image.save(
            f"test-remove-{uuid4()}.gif",
            SimpleUploadedFile(
                "dish.gif",
                b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;",
                content_type="image/gif",
            ),
        )
        image_storage = self.menu_item.image.storage
        image_name = self.menu_item.image.name
        self.addCleanup(image_storage.delete, image_name)

        response = self.client.patch(
            reverse("admin-menu-item-detail", args=(self.menu_item.pk,)),
            {"image": None},
            format="json",
        )

        self.menu_item.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(self.menu_item.image)
        self.assertFalse(image_storage.exists(image_name))

    def test_admin_destroy_menu_item_performs_soft_delete(self):
        self.authenticate(self.admin)
        url = reverse("admin-menu-item-detail", args=(self.menu_item.pk,))

        response = self.client.delete(url)

        self.menu_item.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(self.menu_item.is_deleted)
        self.assertFalse(self.menu_item.is_visible)
        self.assertFalse(self.menu_item.is_available)
        self.assertTrue(MenuItem.objects.filter(pk=self.menu_item.pk).exists())

    def test_deleted_records_are_excluded_from_lists(self):
        self.authenticate(self.admin)
        self.category.is_deleted = True
        self.category.save(update_fields=("is_deleted", "updated_at"))
        self.menu_item.is_deleted = True
        self.menu_item.save(update_fields=("is_deleted", "updated_at"))

        category_response = self.client.get(self.category_list_url)
        menu_item_response = self.client.get(self.menu_item_list_url)

        self.assertEqual(category_response.status_code, status.HTTP_200_OK)
        self.assertEqual(menu_item_response.status_code, status.HTTP_200_OK)
        self.assertEqual(category_response.data, [])
        self.assertEqual(menu_item_response.data, [])
