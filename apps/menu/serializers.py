from django.db import transaction
from django.db.models import Max
from rest_framework import serializers

from .models import Category, MenuItem


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


class MenuItemSerializer(serializers.ModelSerializer):
    cooking_time_min = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
        max_value=300,
    )

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
        )
        read_only_fields = ("id", "created_at", "updated_at")

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
