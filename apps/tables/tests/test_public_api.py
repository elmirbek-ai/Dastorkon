from django.conf import settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.restaurants.models import Restaurant
from apps.tables.models import ActiveTableSession, CustomerSession, RestaurantTable


class PublicCustomerSessionApiTests(APITestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Dastorkon")
        self.table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=1,
        )
        self.url = reverse(
            "public-customer-session",
            args=(self.table.qr_token,),
        )

    def test_session_endpoint_works_without_authentication(self):
        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["restaurant"]["id"], self.restaurant.pk)
        self.assertEqual(response.data["table"]["id"], self.table.pk)
        self.assertTrue(response.data["comments_enabled"])

    def test_invalid_qr_token_returns_not_found(self):
        response = self.client.post("/api/public/qr/not-a-uuid/session/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_inactive_table_returns_not_found(self):
        self.table.is_active = False
        self.table.save(update_fields=("is_active", "updated_at"))

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_session_endpoint_creates_table_session_and_occupies_table(self):
        response = self.client.post(self.url)

        self.table.refresh_from_db()
        table_session = ActiveTableSession.objects.get(table=self.table)
        self.assertEqual(response.data["table_session_id"], table_session.pk)
        self.assertEqual(table_session.status, ActiveTableSession.Status.ACTIVE)
        self.assertEqual(self.table.status, RestaurantTable.Status.OCCUPIED)

    def test_session_endpoint_creates_customer_session_and_cookie(self):
        response = self.client.post(self.url)

        customer_session = CustomerSession.objects.get(
            pk=response.data["customer_session_id"],
        )
        cookie = response.cookies["customer_session_key"]
        self.assertTrue(customer_session.is_active)
        self.assertEqual(cookie.value, str(customer_session.session_key))
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(bool(cookie["secure"]), not settings.DEBUG)

    def test_session_endpoint_reuses_valid_customer_session_cookie(self):
        first_response = self.client.post(self.url)

        second_response = self.client.post(self.url)

        self.assertEqual(
            second_response.data["customer_session_id"],
            first_response.data["customer_session_id"],
        )
        self.assertEqual(CustomerSession.objects.count(), 1)

    def test_session_endpoint_does_not_reuse_cookie_from_another_table(self):
        other_table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=2,
        )
        other_url = reverse(
            "public-customer-session",
            args=(other_table.qr_token,),
        )
        other_response = self.client.post(other_url)

        response = self.client.post(self.url)

        self.assertNotEqual(
            response.data["customer_session_id"],
            other_response.data["customer_session_id"],
        )
        customer_session = CustomerSession.objects.get(
            pk=response.data["customer_session_id"],
        )
        self.assertEqual(customer_session.active_table_session.table, self.table)
