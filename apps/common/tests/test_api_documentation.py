from rest_framework import status
from rest_framework.test import APITestCase


class ApiDocumentationTests(APITestCase):
    def get_schema(self):
        response = self.client.get("/api/schema/", {"format": "json"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.json()

    def test_openapi_schema_is_accessible(self):
        response = self.client.get("/api/schema/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_swagger_ui_is_accessible(self):
        response = self.client.get("/api/docs/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_redoc_ui_is_accessible(self):
        response = self.client.get("/api/redoc/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_schema_includes_public_qr_session_endpoint(self):
        schema = self.get_schema()

        self.assertIn("/api/public/qr/{qr_token}/session/", schema["paths"])

    def test_schema_includes_kitchen_orders_endpoint(self):
        schema = self.get_schema()

        self.assertIn("/api/kitchen/orders/", schema["paths"])

    def test_schema_includes_waiter_orders_endpoint(self):
        schema = self.get_schema()

        self.assertIn("/api/waiter/orders/", schema["paths"])

    def test_schema_includes_admin_statistics_endpoint(self):
        schema = self.get_schema()

        self.assertIn("/api/admin/statistics/summary/", schema["paths"])
