from types import SimpleNamespace

from django.contrib.auth.models import AnonymousUser
from django.test import SimpleTestCase

from apps.users.models import User
from apps.users.permissions import (
    IsAdminOrKitchen,
    IsAdminOrWaiter,
    IsAdminRole,
    IsKitchenRole,
    IsWaiterRole,
)


class RolePermissionTests(SimpleTestCase):
    def has_permission(self, permission_class, user):
        request = SimpleNamespace(user=user)
        return permission_class().has_permission(request, view=None)

    def test_admin_passes_admin_permission(self):
        admin = User(role=User.Role.ADMIN)

        self.assertTrue(self.has_permission(IsAdminRole, admin))

    def test_waiter_passes_waiter_permission(self):
        waiter = User(role=User.Role.WAITER)

        self.assertTrue(self.has_permission(IsWaiterRole, waiter))

    def test_kitchen_passes_kitchen_permission(self):
        kitchen = User(role=User.Role.KITCHEN)

        self.assertTrue(self.has_permission(IsKitchenRole, kitchen))

    def test_anonymous_user_fails_all_role_permissions(self):
        anonymous = AnonymousUser()

        for permission_class in (
            IsAdminRole,
            IsWaiterRole,
            IsKitchenRole,
            IsAdminOrWaiter,
            IsAdminOrKitchen,
        ):
            with self.subTest(permission=permission_class.__name__):
                self.assertFalse(
                    self.has_permission(permission_class, anonymous)
                )

    def test_admin_or_waiter_allows_admin_and_waiter(self):
        admin = User(role=User.Role.ADMIN)
        waiter = User(role=User.Role.WAITER)

        self.assertTrue(self.has_permission(IsAdminOrWaiter, admin))
        self.assertTrue(self.has_permission(IsAdminOrWaiter, waiter))

    def test_admin_or_kitchen_allows_admin_and_kitchen(self):
        admin = User(role=User.Role.ADMIN)
        kitchen = User(role=User.Role.KITCHEN)

        self.assertTrue(self.has_permission(IsAdminOrKitchen, admin))
        self.assertTrue(self.has_permission(IsAdminOrKitchen, kitchen))
