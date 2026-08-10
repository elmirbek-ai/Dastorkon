import uuid

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.restaurants.models import Restaurant
from apps.tables.models import RestaurantTable
from apps.tables.services import get_or_create_active_table_session
from apps.users.models import User


class AdminTableApiTests(APITestCase):
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
        self.table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=1,
        )
        self.list_url = reverse("admin-table-list")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_anonymous_user_cannot_access_admin_tables_api(self):
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_waiter_cannot_access_admin_tables_api(self):
        self.authenticate(self.waiter)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_kitchen_user_cannot_access_admin_tables_api(self):
        self.authenticate(self.kitchen)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_table(self):
        self.authenticate(self.admin)

        response = self.client.post(
            self.list_url,
            {"restaurant": self.restaurant.pk, "number": 2},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            RestaurantTable.objects.filter(
                restaurant=self.restaurant,
                number=2,
            ).exists()
        )
        self.assertIn("qr_url", response.data)

    def test_admin_can_list_tables(self):
        self.authenticate(self.admin)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in response.data], [self.table.pk])

    def test_admin_can_retrieve_table(self):
        self.authenticate(self.admin)
        url = reverse("admin-table-detail", args=(self.table.pk,))

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.table.pk)
        self.assertEqual(
            response.data["qr_url"],
            f"/menu/{self.table.qr_token}/",
        )

    def test_admin_can_update_table_number(self):
        self.authenticate(self.admin)
        url = reverse("admin-table-detail", args=(self.table.pk,))

        response = self.client.patch(url, {"number": 5})

        self.table.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.table.number, 5)

    def test_qr_token_is_read_only(self):
        self.authenticate(self.admin)
        url = reverse("admin-table-detail", args=(self.table.pk,))
        original_token = self.table.qr_token

        response = self.client.patch(url, {"qr_token": str(uuid.uuid4())})

        self.table.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.table.qr_token, original_token)

    def test_status_is_read_only(self):
        self.authenticate(self.admin)
        url = reverse("admin-table-detail", args=(self.table.pk,))

        response = self.client.patch(
            url,
            {"status": RestaurantTable.Status.OCCUPIED},
        )

        self.table.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.table.status, RestaurantTable.Status.FREE)

    def test_admin_destroy_table_performs_soft_delete(self):
        self.authenticate(self.admin)
        url = reverse("admin-table-detail", args=(self.table.pk,))

        response = self.client.delete(url)

        self.table.refresh_from_db()
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(self.table.is_active)
        self.assertTrue(RestaurantTable.objects.filter(pk=self.table.pk).exists())

    def test_inactive_table_is_excluded_from_list(self):
        self.authenticate(self.admin)
        self.table.is_active = False
        self.table.save(update_fields=("is_active", "updated_at"))

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_admin_cannot_deactivate_table_with_active_session(self):
        self.authenticate(self.admin)
        get_or_create_active_table_session(self.table)
        url = reverse("admin-table-detail", args=(self.table.pk,))

        delete_response = self.client.delete(url)
        patch_response = self.client.patch(url, {"is_active": False})

        self.table.refresh_from_db()
        self.assertEqual(delete_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(patch_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(self.table.is_active)

    def test_duplicate_table_number_in_same_restaurant_is_rejected(self):
        self.authenticate(self.admin)

        response = self.client.post(
            self.list_url,
            {"restaurant": self.restaurant.pk, "number": self.table.number},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_same_table_number_in_another_restaurant_is_allowed(self):
        self.authenticate(self.admin)
        other_restaurant = Restaurant.objects.create(name="Other")

        response = self.client.post(
            self.list_url,
            {"restaurant": other_restaurant.pk, "number": self.table.number},
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            RestaurantTable.objects.filter(
                restaurant=other_restaurant,
                number=self.table.number,
            ).exists()
        )
