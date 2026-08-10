from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.restaurants.models import Restaurant, RestaurantSettings
from apps.users.models import User


class AdminRestaurantApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin",
            role=User.Role.ADMIN,
        )
        self.waiter = User.objects.create_user(
            username="waiter",
            role=User.Role.WAITER,
        )
        self.kitchen = User.objects.create_user(
            username="kitchen",
            role=User.Role.KITCHEN,
        )
        self.restaurant = Restaurant.objects.create(name="Dastorkon")
        self.inactive_restaurant = Restaurant.objects.create(
            name="Inactive",
            is_active=False,
        )
        self.list_url = reverse("admin-restaurant-list")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def settings_url(self, restaurant=None):
        restaurant = restaurant or self.restaurant
        return reverse("admin-restaurant-settings", args=(restaurant.pk,))

    def test_anonymous_user_cannot_access_restaurant_admin_api(self):
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_waiter_cannot_access_restaurant_admin_api(self):
        self.authenticate(self.waiter)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_kitchen_cannot_access_restaurant_admin_api(self):
        self.authenticate(self.kitchen)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_restaurant(self):
        self.authenticate(self.admin)
        data = {
            "name": "New restaurant",
            "address": "Bishkek",
            "phone": "+996700000000",
        }

        response = self.client.post(self.list_url, data)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Restaurant.objects.filter(name="New restaurant").exists())

    def test_admin_can_list_active_restaurants(self):
        self.authenticate(self.admin)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(self.restaurant.pk, [item["id"] for item in response.data])

    def test_inactive_restaurants_are_excluded_from_list(self):
        self.authenticate(self.admin)

        response = self.client.get(self.list_url)

        self.assertNotIn(
            self.inactive_restaurant.pk,
            [item["id"] for item in response.data],
        )

    def test_admin_can_update_restaurant(self):
        self.authenticate(self.admin)
        url = reverse("admin-restaurant-detail", args=(self.restaurant.pk,))

        response = self.client.patch(url, {"name": "Updated"})

        self.restaurant.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.restaurant.name, "Updated")

    def test_admin_destroy_restaurant_performs_soft_deactivate(self):
        self.authenticate(self.admin)
        url = reverse("admin-restaurant-detail", args=(self.restaurant.pk,))

        response = self.client.delete(url)

        self.restaurant.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(self.restaurant.is_active)
        self.assertTrue(Restaurant.objects.filter(pk=self.restaurant.pk).exists())

    def test_admin_can_get_restaurant_settings(self):
        self.authenticate(self.admin)
        settings = RestaurantSettings.objects.create(
            restaurant=self.restaurant,
            comments_enabled=False,
            default_language=RestaurantSettings.Language.RU,
        )

        response = self.client.get(self.settings_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], settings.pk)
        self.assertFalse(response.data["comments_enabled"])

    def test_settings_are_created_automatically_if_missing(self):
        self.authenticate(self.admin)

        response = self.client.get(self.settings_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            RestaurantSettings.objects.filter(restaurant=self.restaurant).exists()
        )

    def test_admin_can_update_comments_enabled(self):
        self.authenticate(self.admin)

        response = self.client.patch(
            self.settings_url(),
            {"comments_enabled": False},
        )

        settings = RestaurantSettings.objects.get(restaurant=self.restaurant)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(settings.comments_enabled)

    def test_admin_can_update_default_language(self):
        self.authenticate(self.admin)

        response = self.client.patch(
            self.settings_url(),
            {"default_language": RestaurantSettings.Language.RU},
        )

        settings = RestaurantSettings.objects.get(restaurant=self.restaurant)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            settings.default_language,
            RestaurantSettings.Language.RU,
        )

    def test_invalid_default_language_is_rejected(self):
        self.authenticate(self.admin)

        response = self.client.patch(
            self.settings_url(),
            {"default_language": "EN"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_currency_is_rejected(self):
        self.authenticate(self.admin)

        response = self.client.patch(self.settings_url(), {"currency": ""})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_users_cannot_access_settings_endpoint(self):
        for user, expected_status in (
            (None, status.HTTP_401_UNAUTHORIZED),
            (self.waiter, status.HTTP_403_FORBIDDEN),
            (self.kitchen, status.HTTP_403_FORBIDDEN),
        ):
            self.client.force_authenticate(user=user)
            with self.subTest(user=user):
                response = self.client.get(self.settings_url())
                self.assertEqual(response.status_code, expected_status)
