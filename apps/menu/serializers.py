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


class MenuItemSerializer(serializers.ModelSerializer):
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
