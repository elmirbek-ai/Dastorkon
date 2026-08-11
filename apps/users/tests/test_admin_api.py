from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()


class AdminUserApiTests(APITestCase):
    url = "/api/admin/users/"

    def setUp(self):
        self.admin = User.objects.create_user("admin", password="password", role=User.Role.ADMIN)
        self.waiter = User.objects.create_user("waiter", password="password", role=User.Role.WAITER)
        self.kitchen = User.objects.create_user("kitchen", password="password", role=User.Role.KITCHEN)
        self.inactive = User.objects.create_user("inactive", password="password", is_active=False)

    def authenticate_admin(self):
        self.client.force_authenticate(self.admin)

    def test_anonymous_user_cannot_access_admin_users(self):
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_waiter_cannot_access_admin_users(self):
        self.client.force_authenticate(self.waiter)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)

    def test_kitchen_cannot_access_admin_users(self):
        self.client.force_authenticate(self.kitchen)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_waiter_user(self):
        self.authenticate_admin()
        response = self.client.post(
            self.url, {"username": "new-waiter", "password": "secret123", "role": User.Role.WAITER}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.get(username="new-waiter").role, User.Role.WAITER)

    def test_admin_can_create_kitchen_user(self):
        self.authenticate_admin()
        response = self.client.post(
            self.url, {"username": "new-kitchen", "password": "secret123", "role": User.Role.KITCHEN}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_admin_can_create_admin_user(self):
        self.authenticate_admin()
        response = self.client.post(
            self.url, {"username": "new-admin", "password": "secret123", "role": User.Role.ADMIN}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_created_user_password_is_hashed(self):
        self.authenticate_admin()
        self.client.post(self.url, {"username": "created", "password": "secret123"})
        user = User.objects.get(username="created")
        self.assertNotEqual(user.password, "secret123")
        self.assertTrue(user.check_password("secret123"))

    def test_password_is_not_returned(self):
        self.authenticate_admin()
        response = self.client.post(self.url, {"username": "created", "password": "secret123"})
        self.assertNotIn("password", response.data)

    def test_admin_can_list_active_users(self):
        self.authenticate_admin()
        response = self.client.get(self.url)
        usernames = {item["username"] for item in response.data}
        self.assertIn(self.admin.username, usernames)
        self.assertIn(self.waiter.username, usernames)

    def test_inactive_users_are_excluded_from_list(self):
        self.authenticate_admin()
        response = self.client.get(self.url)
        self.assertNotIn(self.inactive.username, {item["username"] for item in response.data})

    def test_admin_can_explicitly_list_inactive_users(self):
        self.authenticate_admin()
        response = self.client.get(self.url, {"include_inactive": "true"})
        self.assertIn(self.inactive.username, {item["username"] for item in response.data})

    def test_admin_can_retrieve_user_detail(self):
        self.authenticate_admin()
        response = self.client.get(f"{self.url}{self.waiter.pk}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], self.waiter.username)

    def test_admin_can_update_user_details(self):
        self.authenticate_admin()
        response = self.client.patch(
            f"{self.url}{self.waiter.pk}/",
            {"first_name": "Aibek", "last_name": "Uulu", "phone": "+996700000000"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.waiter.refresh_from_db()
        self.assertEqual((self.waiter.first_name, self.waiter.last_name), ("Aibek", "Uulu"))
        self.assertEqual(self.waiter.phone, "+996700000000")

    def test_admin_can_update_user_role(self):
        self.authenticate_admin()
        response = self.client.patch(f"{self.url}{self.waiter.pk}/", {"role": User.Role.KITCHEN})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.waiter.refresh_from_db()
        self.assertEqual(self.waiter.role, User.Role.KITCHEN)

    def test_invalid_role_is_rejected(self):
        self.authenticate_admin()
        response = self.client.patch(f"{self.url}{self.waiter.pk}/", {"role": "INVALID"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_username_is_rejected(self):
        self.authenticate_admin()
        response = self.client.post(self.url, {"username": self.waiter.username, "password": "secret123"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_update_password(self):
        self.authenticate_admin()
        response = self.client.patch(f"{self.url}{self.waiter.pk}/", {"password": "new-secret"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.waiter.refresh_from_db()
        self.assertTrue(self.waiter.check_password("new-secret"))

    def test_updated_password_is_hashed(self):
        self.authenticate_admin()
        self.client.patch(f"{self.url}{self.waiter.pk}/", {"password": "new-secret"})
        self.waiter.refresh_from_db()
        self.assertNotEqual(self.waiter.password, "new-secret")

    def test_destroy_soft_deactivates_user(self):
        self.authenticate_admin()
        response = self.client.delete(f"{self.url}{self.waiter.pk}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.waiter.refresh_from_db()
        self.assertFalse(self.waiter.is_active)
        self.assertTrue(User.objects.filter(pk=self.waiter.pk).exists())

    def test_admin_cannot_deactivate_own_account(self):
        self.authenticate_admin()
        delete_response = self.client.delete(f"{self.url}{self.admin.pk}/")
        patch_response = self.client.patch(f"{self.url}{self.admin.pk}/", {"is_active": False})
        self.assertEqual(delete_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(patch_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_non_existing_user_returns_404(self):
        self.authenticate_admin()
        response = self.client.get(f"{self.url}999999/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class CurrentUserApiTests(APITestCase):
    url = "/api/auth/me/"

    def setUp(self):
        self.user = User.objects.create_user(
            "waiter-me",
            password="password",
            role=User.Role.WAITER,
            phone="+996700000001",
        )

    def test_anonymous_user_cannot_get_current_user(self):
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_gets_safe_identity_fields(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {
                "id": self.user.pk,
                "username": self.user.username,
                "role": User.Role.WAITER,
                "phone": self.user.phone,
                "is_active": True,
            },
        )
        self.assertNotIn("password", response.data)
