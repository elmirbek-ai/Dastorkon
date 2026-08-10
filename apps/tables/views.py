from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework import serializers, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsAdminRole

from .models import ActiveTableSession, CustomerSession, RestaurantTable
from .serializers import RestaurantTableSerializer
from .services import (
    create_customer_session,
    get_or_create_active_table_session,
    get_table_by_qr_token,
)


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


class CustomerSessionStartView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request, qr_token):
        try:
            table = get_table_by_qr_token(qr_token)
        except DjangoValidationError:
            return Response(status=status.HTTP_404_NOT_FOUND)

        table_session = get_or_create_active_table_session(table)
        customer_session = self.get_customer_session(request, table_session)
        if customer_session is None:
            customer_session = create_customer_session(table_session)

        restaurant_settings = getattr(table.restaurant, "settings", None)
        comments_enabled = (
            restaurant_settings.comments_enabled
            if restaurant_settings is not None
            else True
        )
        response = Response(
            {
                "restaurant": {
                    "id": table.restaurant_id,
                    "name": table.restaurant.name,
                },
                "table": {"id": table.pk, "number": table.number},
                "table_session_id": table_session.pk,
                "customer_session_id": customer_session.pk,
                "comments_enabled": comments_enabled,
            }
        )
        response.set_cookie(
            "customer_session_key",
            str(customer_session.session_key),
            httponly=True,
            samesite="Lax",
            secure=not settings.DEBUG,
        )
        return response

    def get_customer_session(self, request, table_session):
        session_key = request.COOKIES.get("customer_session_key")
        if not session_key:
            return None
        try:
            return CustomerSession.objects.filter(
                session_key=session_key,
                active_table_session=table_session,
                is_active=True,
            ).first()
        except DjangoValidationError:
            return None
