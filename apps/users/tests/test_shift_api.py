from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users.models import User, WaiterShift


class WaiterShiftApiTests(APITestCase):
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
        self.start_url = reverse("waiter-shift-start")
        self.end_url = reverse("waiter-shift-end")
        self.current_url = reverse("waiter-shift-current")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_anonymous_user_cannot_access_waiter_shift_api(self):
        response = self.client.post(self.start_url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_cannot_access_waiter_shift_api(self):
        self.authenticate(self.admin)

        response = self.client.post(self.start_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_kitchen_cannot_access_waiter_shift_api(self):
        self.authenticate(self.kitchen)

        response = self.client.post(self.start_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_waiter_can_start_shift(self):
        self.authenticate(self.waiter)

        response = self.client.post(self.start_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["waiter"], self.waiter.pk)
        self.assertTrue(response.data["is_active"])
        self.assertTrue(
            WaiterShift.objects.filter(waiter=self.waiter, is_active=True).exists()
        )

    def test_starting_shift_twice_returns_same_shift(self):
        self.authenticate(self.waiter)
        first_response = self.client.post(self.start_url)

        second_response = self.client.post(self.start_url)

        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.data["id"], first_response.data["id"])
        self.assertEqual(
            WaiterShift.objects.filter(waiter=self.waiter, is_active=True).count(),
            1,
        )

    def test_waiter_can_get_current_active_shift(self):
        self.authenticate(self.waiter)
        shift = WaiterShift.objects.create(waiter=self.waiter)

        response = self.client.get(self.current_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], shift.pk)

    def test_current_endpoint_returns_null_without_active_shift(self):
        self.authenticate(self.waiter)

        response = self.client.get(self.current_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data)

    def test_waiter_can_end_active_shift(self):
        self.authenticate(self.waiter)
        shift = WaiterShift.objects.create(waiter=self.waiter)

        response = self.client.post(self.end_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], shift.pk)

    def test_ending_shift_sets_ended_at_and_inactive(self):
        self.authenticate(self.waiter)
        shift = WaiterShift.objects.create(waiter=self.waiter)

        self.client.post(self.end_url)

        shift.refresh_from_db()
        self.assertFalse(shift.is_active)
        self.assertIsNotNone(shift.ended_at)

    def test_ending_shift_without_active_shift_returns_bad_request(self):
        self.authenticate(self.waiter)

        response = self.client.post(self.end_url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
