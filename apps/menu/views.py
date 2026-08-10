from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Prefetch
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tables.services import get_table_by_qr_token
from apps.users.permissions import IsAdminRole

from .models import Category, MenuItem
from .serializers import (
    CategorySerializer,
    MenuItemSerializer,
    PublicCategorySerializer,
)


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


class PublicMenuView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(
        responses={
            200: inline_serializer(
                name="PublicMenuResponse",
                fields={
                    "restaurant": serializers.DictField(),
                    "table": serializers.DictField(),
                    "categories": PublicCategorySerializer(many=True),
                },
            ),
            404: OpenApiResponse(description="QR table not found."),
        }
    )
    def get(self, request, qr_token):
        try:
            table = get_table_by_qr_token(qr_token)
        except DjangoValidationError:
            return Response(status=status.HTTP_404_NOT_FOUND)

        menu_items = MenuItem.objects.filter(
            restaurant=table.restaurant,
            is_deleted=False,
            is_visible=True,
            is_available=True,
        )
        categories = (
            Category.objects.filter(
                restaurant=table.restaurant,
                is_deleted=False,
                is_visible=True,
            )
            .prefetch_related(
                Prefetch("items", queryset=menu_items, to_attr="public_items")
            )
        )
        serializer = PublicCategorySerializer(
            categories,
            many=True,
            context={"request": request},
        )
        return Response(
            {
                "restaurant": {
                    "id": table.restaurant_id,
                    "name": table.restaurant.name,
                },
                "table": {"id": table.pk, "number": table.number},
                "categories": serializer.data,
            }
        )
