from rest_framework import serializers

from .models import Restaurant, RestaurantSettings


class RestaurantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Restaurant
        fields = (
            "id",
            "name",
            "logo",
            "address",
            "phone",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class RestaurantSettingsSerializer(serializers.ModelSerializer):
    currency = serializers.CharField(max_length=10, allow_blank=False)

    class Meta:
        model = RestaurantSettings
        fields = (
            "id",
            "restaurant",
            "comments_enabled",
            "default_language",
            "currency",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "restaurant",
            "created_at",
            "updated_at",
        )
