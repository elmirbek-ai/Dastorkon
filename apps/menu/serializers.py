from decimal import Decimal

from django.db import transaction
from django.db.models import Max
from rest_framework import serializers

from .models import (
    Category,
    MenuItem,
    MenuItemModifierGroup,
    MenuItemModifierOption,
)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = (
            "id",
            "restaurant",
            "name_ky",
            "name_ru",
            "sort_order",
            "is_visible",
            "is_deleted",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def create(self, validated_data):
        if "sort_order" in validated_data:
            return super().create(validated_data)

        restaurant = validated_data["restaurant"]
        with transaction.atomic():
            restaurant.__class__.objects.select_for_update().get(pk=restaurant.pk)
            current_max = Category.objects.filter(
                restaurant=restaurant,
            ).aggregate(max_order=Max("sort_order"))["max_order"]
            validated_data["sort_order"] = (
                0 if current_max is None else current_max + 1
            )
            return super().create(validated_data)


class MenuItemModifierOptionSerializer(serializers.ModelSerializer):
    price_delta = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        default=Decimal("0.00"),
    )

    class Meta:
        model = MenuItemModifierOption
        fields = (
            "id",
            "group",
            "name_ky",
            "name_ru",
            "price_delta",
            "sort_order",
            "is_available",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "group", "created_at", "updated_at")


class MenuItemModifierGroupSerializer(serializers.ModelSerializer):
    min_selected = serializers.IntegerField(min_value=0, default=0)
    max_selected = serializers.IntegerField(
        min_value=0,
        required=False,
        allow_null=True,
    )
    sort_order = serializers.IntegerField(min_value=0, default=0)
    options = MenuItemModifierOptionSerializer(many=True, read_only=True)

    class Meta:
        model = MenuItemModifierGroup
        fields = (
            "id",
            "menu_item",
            "name_ky",
            "name_ru",
            "selection_type",
            "is_required",
            "min_selected",
            "max_selected",
            "sort_order",
            "is_active",
            "options",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "menu_item",
            "options",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        selection_type = attrs.get(
            "selection_type",
            getattr(self.instance, "selection_type", None),
        )
        is_required = attrs.get(
            "is_required",
            getattr(self.instance, "is_required", False),
        )
        min_selected = attrs.get(
            "min_selected",
            getattr(self.instance, "min_selected", 0),
        )
        max_selected = attrs.get(
            "max_selected",
            getattr(self.instance, "max_selected", None),
        )
        errors = {}
        if max_selected is not None and max_selected < min_selected:
            errors["max_selected"] = (
                "Maximum selections cannot be less than minimum selections."
            )
        if selection_type == MenuItemModifierGroup.SelectionType.SINGLE:
            if min_selected > 1:
                errors["min_selected"] = (
                    "Single-selection groups cannot require more than one selection."
                )
            if max_selected not in (None, 1):
                errors["max_selected"] = (
                    "Single-selection groups must have a maximum of one selection."
                )
        if is_required and min_selected < 1:
            errors["min_selected"] = (
                "Required groups must require at least one selection."
            )
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class ActiveMenuItemModifierOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItemModifierOption
        fields = (
            "id",
            "name_ky",
            "name_ru",
            "price_delta",
            "sort_order",
            "is_available",
        )
        read_only_fields = fields


class ActiveMenuItemModifierGroupSerializer(serializers.ModelSerializer):
    options = ActiveMenuItemModifierOptionSerializer(
        source="public_options",
        many=True,
        read_only=True,
    )

    class Meta:
        model = MenuItemModifierGroup
        fields = (
            "id",
            "name_ky",
            "name_ru",
            "selection_type",
            "is_required",
            "min_selected",
            "max_selected",
            "sort_order",
            "options",
        )
        read_only_fields = fields


class MenuItemSerializer(serializers.ModelSerializer):
    cooking_time_min = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
        max_value=300,
    )
    modifier_groups = MenuItemModifierGroupSerializer(many=True, read_only=True)

    class Meta:
        model = MenuItem
        fields = (
            "id",
            "restaurant",
            "category",
            "name_ky",
            "name_ru",
            "description_ky",
            "description_ru",
            "image",
            "price",
            "ingredients_ky",
            "ingredients_ru",
            "allergens_ky",
            "allergens_ru",
            "cooking_time_min",
            "is_hit",
            "is_new",
            "is_spicy",
            "is_vegetarian",
            "is_recommended",
            "is_available",
            "is_visible",
            "is_deleted",
            "created_at",
            "updated_at",
            "modifier_groups",
        )
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
            "modifier_groups",
        )

    def validate(self, attrs):
        restaurant = attrs.get(
            "restaurant",
            getattr(self.instance, "restaurant", None),
        )
        category = attrs.get(
            "category",
            getattr(self.instance, "category", None),
        )
        if restaurant and category and category.restaurant_id != restaurant.pk:
            raise serializers.ValidationError(
                {"category": "Category must belong to the same restaurant."}
            )
        return attrs

    def update(self, instance, validated_data):
        remove_image = "image" in validated_data and validated_data["image"] is None
        image_storage = instance.image.storage if remove_image and instance.image else None
        image_name = instance.image.name if remove_image and instance.image else ""
        updated_instance = super().update(instance, validated_data)
        if image_storage and image_name:
            image_storage.delete(image_name)
        return updated_instance


class PublicMenuItemSerializer(serializers.ModelSerializer):
    modifier_groups = ActiveMenuItemModifierGroupSerializer(
        source="public_modifier_groups",
        many=True,
        read_only=True,
    )

    class Meta:
        model = MenuItem
        fields = (
            "id",
            "name_ky",
            "name_ru",
            "description_ky",
            "description_ru",
            "image",
            "price",
            "ingredients_ky",
            "ingredients_ru",
            "allergens_ky",
            "allergens_ru",
            "cooking_time_min",
            "is_hit",
            "is_new",
            "is_spicy",
            "is_vegetarian",
            "is_recommended",
            "is_available",
            "modifier_groups",
        )


class WaiterMenuItemSerializer(serializers.ModelSerializer):
    category_name_ky = serializers.CharField(
        source="category.name_ky",
        read_only=True,
    )
    category_name_ru = serializers.CharField(
        source="category.name_ru",
        read_only=True,
    )
    modifier_groups = ActiveMenuItemModifierGroupSerializer(
        source="public_modifier_groups",
        many=True,
        read_only=True,
    )

    class Meta:
        model = MenuItem
        fields = (
            "id",
            "category",
            "category_name_ky",
            "category_name_ru",
            "name_ky",
            "name_ru",
            "price",
            "cooking_time_min",
            "is_hit",
            "is_new",
            "is_spicy",
            "is_vegetarian",
            "is_recommended",
            "is_available",
            "is_visible",
            "modifier_groups",
        )
        read_only_fields = fields


class MenuItemAvailabilityUpdateSerializer(serializers.Serializer):
    is_available = serializers.BooleanField()

    def validate(self, attrs):
        unexpected_fields = set(self.initial_data) - {"is_available"}
        if unexpected_fields:
            raise serializers.ValidationError(
                {
                    field: "Waiters can only change menu item availability."
                    for field in sorted(unexpected_fields)
                }
            )
        return attrs


class PublicCategorySerializer(serializers.ModelSerializer):
    items = PublicMenuItemSerializer(
        source="public_items",
        many=True,
        read_only=True,
    )

    class Meta:
        model = Category
        fields = ("id", "name_ky", "name_ru", "sort_order", "items")
