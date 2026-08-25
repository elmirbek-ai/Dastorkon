from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Prefetch
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import generics, serializers, status, viewsets
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tables.services import get_table_by_qr_token
from apps.users.permissions import IsAdminRole, IsWaiterRole

from .models import (
    Category,
    MenuItem,
    MenuItemModifierGroup,
    MenuItemModifierOption,
)
from .querysets import active_modifier_groups_prefetch
from .serializers import (
    CategorySerializer,
    MenuItemAvailabilityUpdateSerializer,
    MenuItemModifierGroupSerializer,
    MenuItemModifierOptionSerializer,
    MenuItemSerializer,
    PublicCategorySerializer,
    WaiterMenuItemSerializer,
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
    queryset = MenuItem.objects.select_related(
        "restaurant",
        "category",
    ).prefetch_related("modifier_groups__options")
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


class MenuItemModifierGroupListCreateView(generics.ListCreateAPIView):
    serializer_class = MenuItemModifierGroupSerializer
    permission_classes = (IsAdminRole,)

    def get_menu_item(self):
        return get_object_or_404(
            MenuItem,
            pk=self.kwargs["item_id"],
            is_deleted=False,
        )

    def get_queryset(self):
        return (
            MenuItemModifierGroup.objects.filter(menu_item=self.get_menu_item())
            .select_related("menu_item")
            .prefetch_related("options")
        )

    def perform_create(self, serializer):
        serializer.save(menu_item=self.get_menu_item())


class MenuItemModifierGroupDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MenuItemModifierGroupSerializer
    permission_classes = (IsAdminRole,)
    lookup_url_kwarg = "group_id"

    def get_queryset(self):
        return (
            MenuItemModifierGroup.objects.filter(menu_item__is_deleted=False)
            .select_related("menu_item")
            .prefetch_related("options")
        )

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=("is_active", "updated_at"))


class MenuItemModifierOptionListCreateView(generics.ListCreateAPIView):
    serializer_class = MenuItemModifierOptionSerializer
    permission_classes = (IsAdminRole,)

    def get_group(self):
        return get_object_or_404(
            MenuItemModifierGroup.objects.select_related("menu_item"),
            pk=self.kwargs["group_id"],
            menu_item__is_deleted=False,
        )

    def get_queryset(self):
        return MenuItemModifierOption.objects.filter(group=self.get_group()).select_related(
            "group"
        )

    def perform_create(self, serializer):
        serializer.save(group=self.get_group())


class MenuItemModifierOptionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MenuItemModifierOptionSerializer
    permission_classes = (IsAdminRole,)
    lookup_url_kwarg = "option_id"

    def get_queryset(self):
        return MenuItemModifierOption.objects.filter(
            group__menu_item__is_deleted=False,
        ).select_related("group")

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=("is_active", "updated_at"))


class WaiterMenuItemListView(APIView):
    permission_classes = (IsWaiterRole,)

    @extend_schema(responses=WaiterMenuItemSerializer(many=True))
    def get(self, request):
        menu_items = (
            MenuItem.objects.filter(
                is_deleted=False,
                category__is_deleted=False,
            )
            .select_related("category")
            .prefetch_related(active_modifier_groups_prefetch())
            .order_by(
                "category__sort_order",
                "category__name_ky",
                "name_ky",
            )
        )
        return Response(WaiterMenuItemSerializer(menu_items, many=True).data)


class WaiterMenuItemAvailabilityView(APIView):
    permission_classes = (IsWaiterRole,)

    @extend_schema(
        request=MenuItemAvailabilityUpdateSerializer,
        responses=WaiterMenuItemSerializer,
    )
    def patch(self, request, item_id):
        menu_item = get_object_or_404(
            MenuItem.objects.select_related("category").prefetch_related(
                active_modifier_groups_prefetch()
            ),
            pk=item_id,
            is_deleted=False,
            category__is_deleted=False,
        )
        serializer = MenuItemAvailabilityUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        menu_item.is_available = serializer.validated_data["is_available"]
        menu_item.save(update_fields=("is_available", "updated_at"))
        return Response(WaiterMenuItemSerializer(menu_item).data)


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
        ).prefetch_related(active_modifier_groups_prefetch())
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
