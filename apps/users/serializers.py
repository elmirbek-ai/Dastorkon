from rest_framework import serializers

from .models import User, WaiterShift


class AdminUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "password",
            "first_name",
            "last_name",
            "email",
            "phone",
            "role",
            "avatar",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "last_login",
        )
        read_only_fields = ("id", "is_superuser", "date_joined", "last_login")

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=("password",))
        return user


class WaiterShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = WaiterShift
        fields = ("id", "waiter", "started_at", "ended_at", "is_active")
        read_only_fields = fields
