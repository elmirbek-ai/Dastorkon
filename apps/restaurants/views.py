from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound

from apps.users.permissions import IsAdminRole

from .models import Restaurant, RestaurantSettings
from .serializers import RestaurantSerializer, RestaurantSettingsSerializer


class RestaurantAdminViewSet(viewsets.ModelViewSet):
    queryset = Restaurant.objects.all()
    serializer_class = RestaurantSerializer
    permission_classes = (IsAdminRole,)

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list":
            queryset = queryset.filter(is_active=True)
        return queryset

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=("is_active", "updated_at"))


class RestaurantSettingsView(APIView):
    permission_classes = (IsAdminRole,)

    def get_restaurant(self, restaurant_id):
        try:
            return Restaurant.objects.get(pk=restaurant_id)
        except Restaurant.DoesNotExist as exc:
            raise NotFound("Restaurant not found.") from exc

    def get_settings(self, restaurant_id):
        restaurant = self.get_restaurant(restaurant_id)
        settings, _ = RestaurantSettings.objects.get_or_create(
            restaurant=restaurant,
        )
        return settings

    @extend_schema(responses=RestaurantSettingsSerializer)
    def get(self, request, restaurant_id):
        settings = self.get_settings(restaurant_id)
        return Response(RestaurantSettingsSerializer(settings).data)

    @extend_schema(
        request=RestaurantSettingsSerializer,
        responses=RestaurantSettingsSerializer,
    )
    def patch(self, request, restaurant_id):
        settings = self.get_settings(restaurant_id)
        serializer = RestaurantSettingsSerializer(
            settings,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
