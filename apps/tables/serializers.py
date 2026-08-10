from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import ActiveTableSession, RestaurantTable


class RestaurantTableSerializer(serializers.ModelSerializer):
    qr_url = serializers.SerializerMethodField()

    class Meta:
        model = RestaurantTable
        fields = (
            "id",
            "restaurant",
            "number",
            "qr_token",
            "qr_url",
            "status",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "qr_token",
            "qr_url",
            "status",
            "created_at",
            "updated_at",
        )

    @extend_schema_field(str)
    def get_qr_url(self, obj):
        return f"/menu/{obj.qr_token}/"

    def validate(self, attrs):
        if (
            self.instance
            and attrs.get("is_active") is False
            and self.instance.sessions.filter(
                status=ActiveTableSession.Status.ACTIVE,
            ).exists()
        ):
            raise serializers.ValidationError(
                {"is_active": "Table has an active session."}
        )
        return attrs
