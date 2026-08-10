from rest_framework import viewsets

from apps.users.permissions import IsAdminRole

from .models import Category, MenuItem
from .serializers import CategorySerializer, MenuItemSerializer


class CategoryAdminViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = (IsAdminRole,)

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list":
            queryset = queryset.filter(is_deleted=False)
        return queryset

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.is_visible = False
        instance.save(update_fields=("is_deleted", "is_visible", "updated_at"))


class MenuItemAdminViewSet(viewsets.ModelViewSet):
    queryset = MenuItem.objects.select_related("restaurant", "category")
    serializer_class = MenuItemSerializer
    permission_classes = (IsAdminRole,)

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list":
            queryset = queryset.filter(is_deleted=False)
        return queryset

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.is_visible = False
        instance.is_available = False
        instance.save(
            update_fields=(
                "is_deleted",
                "is_visible",
                "is_available",
                "updated_at",
            )
        )
