from rest_framework import status
from rest_framework.test import APITestCase


class ApiDocumentationTests(APITestCase):
    def test_openapi_schema_is_accessible(self):
        response = self.client.get("/api/schema/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_swagger_ui_is_accessible(self):
        response = self.client.get("/api/docs/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_redoc_ui_is_accessible(self):
        response = self.client.get("/api/redoc/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
