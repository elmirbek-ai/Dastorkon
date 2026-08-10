from rest_framework import serializers, viewsets

from apps.users.permissions import IsAdminRole

from .models import ActiveTableSession, RestaurantTable
from .serializers import RestaurantTableSerializer


class RestaurantTableAdminViewSet(viewsets.ModelViewSet):
    queryset = RestaurantTable.objects.select_related("restaurant")
    serializer_class = RestaurantTableSerializer
    permission_classes = (IsAdminRole,)

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list":
            queryset = queryset.filter(is_active=True)
        return queryset

    def perform_destroy(self, instance):
        if instance.sessions.filter(
            status=ActiveTableSession.Status.ACTIVE,
        ).exists():
            raise serializers.ValidationError("Table has an active session.")
        instance.is_active = False
        instance.save(update_fields=("is_active", "updated_at"))
