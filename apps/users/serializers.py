from rest_framework import serializers

from .models import WaiterShift


class WaiterShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = WaiterShift
        fields = ("id", "waiter", "started_at", "ended_at", "is_active")
        read_only_fields = fields
