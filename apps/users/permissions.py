from rest_framework.permissions import BasePermission

from .models import User


class RolePermission(BasePermission):
    roles = ()

    def has_permission(self, request, view):
        return bool(
            request.user.is_authenticated
            and request.user.role in self.roles
        )


class IsAdminRole(RolePermission):
    roles = (User.Role.ADMIN,)


class IsWaiterRole(RolePermission):
    roles = (User.Role.WAITER,)


class IsKitchenRole(RolePermission):
    roles = (User.Role.KITCHEN,)


class IsAdminOrWaiter(RolePermission):
    roles = (User.Role.ADMIN, User.Role.WAITER)


class IsAdminOrKitchen(RolePermission):
    roles = (User.Role.ADMIN, User.Role.KITCHEN)
