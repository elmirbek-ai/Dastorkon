from rest_framework import serializers
from phonenumber_field.serializerfields import PhoneNumberField

from .models import User, WaiterShift


class AdminUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)
    primary_phone = PhoneNumberField(required=False, allow_blank=True, region="KG")
    phone = PhoneNumberField(
        source="primary_phone",
        required=False,
        allow_blank=True,
        region="KG",
    )

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "password",
            "first_name",
            "last_name",
            "email",
            "primary_phone",
            "phone",
            "secondary_phone",
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

    def validate(self, attrs):
        if "phone" in self.initial_data and "primary_phone" in self.initial_data:
            raise serializers.ValidationError(
                {"phone": "Use either phone or primary_phone, not both."}
            )
        return attrs

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=("password",))
        return user


class CurrentUserSerializer(serializers.ModelSerializer):
    phone = PhoneNumberField(source="primary_phone", read_only=True, region="KG")

    class Meta:
        model = User
        fields = ("id", "username", "role", "phone", "is_active")
        read_only_fields = fields


class WaiterProfileSerializer(serializers.ModelSerializer):
    phone = PhoneNumberField(source="primary_phone", read_only=True, region="KG")
    primary_phone = PhoneNumberField(read_only=True, region="KG")
    secondary_phone = PhoneNumberField(read_only=True, region="KG")
    full_name = serializers.SerializerMethodField()
    role_label = serializers.CharField(source="get_role_display", read_only=True)
    account_status = serializers.SerializerMethodField()
    profile_completed = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "full_name",
            "primary_phone",
            "phone",
            "secondary_phone",
            "avatar",
            "role",
            "role_label",
            "is_active",
            "account_status",
            "date_joined",
            "last_login",
            "profile_completed",
        )
        read_only_fields = fields

    def get_full_name(self, user):
        return " ".join(part for part in (user.first_name.strip(), user.last_name.strip()) if part)

    def get_account_status(self, user):
        return "active" if user.is_active else "inactive"

    def get_profile_completed(self, user):
        return bool(
            user.first_name.strip()
            and user.last_name.strip()
            and user.primary_phone
            and user.primary_phone.is_valid()
        )


class WaiterProfileUpdateSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(required=False, allow_blank=False, trim_whitespace=True)
    last_name = serializers.CharField(required=False, allow_blank=False, trim_whitespace=True)
    primary_phone = PhoneNumberField(required=False, allow_blank=False, region="KG")
    phone = PhoneNumberField(
        source="primary_phone",
        required=False,
        allow_blank=False,
        region="KG",
    )
    secondary_phone = PhoneNumberField(required=False, allow_blank=True, region="KG")

    class Meta:
        model = User
        fields = (
            "first_name",
            "last_name",
            "primary_phone",
            "phone",
            "secondary_phone",
        )

    def to_internal_value(self, data):
        unexpected_fields = set(data.keys()) - set(self.fields)
        if unexpected_fields:
            raise serializers.ValidationError(
                {field: "This field cannot be updated." for field in sorted(unexpected_fields)}
            )
        if "phone" in data and "primary_phone" in data:
            raise serializers.ValidationError(
                {"phone": "Use either phone or primary_phone, not both."}
            )
        return super().to_internal_value(data)


class WaiterShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = WaiterShift
        fields = ("id", "waiter", "started_at", "ended_at", "is_active")
        read_only_fields = fields
