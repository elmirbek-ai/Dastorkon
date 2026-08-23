from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.users.models import User


class RoleTokenLifetimeTests(APITestCase):
    expected_lifetimes = {
        User.Role.ADMIN: 24 * 60 * 60,
        User.Role.WAITER: 12 * 60 * 60,
        User.Role.KITCHEN: 24 * 60 * 60,
    }

    def test_staff_roles_receive_the_configured_session_lifetime(self):
        for role, expected_seconds in self.expected_lifetimes.items():
            with self.subTest(role=role):
                username = role.lower()
                User.objects.create_user(
                    username=username,
                    password="test-pass",
                    role=role,
                )

                response = self.client.post(
                    "/api/auth/token/",
                    {"username": username, "password": "test-pass"},
                )

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                access = AccessToken(response.data["access"])
                refresh = RefreshToken(response.data["refresh"])
                self.assertEqual(access["exp"] - access["iat"], expected_seconds)
                self.assertEqual(refresh["exp"] - refresh["iat"], expected_seconds)
                self.assertEqual(refresh["session_exp"], refresh["exp"])
                self.assertEqual(response.data["expires_in"], expected_seconds)

    def test_refresh_does_not_extend_the_original_session(self):
        waiter = User.objects.create_user(
            username="waiter",
            password="test-pass",
            role=User.Role.WAITER,
        )
        login_response = self.client.post(
            "/api/auth/token/",
            {"username": waiter.username, "password": "test-pass"},
        )
        original_refresh = RefreshToken(login_response.data["refresh"])

        response = self.client.post(
            "/api/auth/token/refresh/",
            {"refresh": login_response.data["refresh"]},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        refreshed_access = AccessToken(response.data["access"])
        self.assertEqual(refreshed_access["exp"], original_refresh["session_exp"])
