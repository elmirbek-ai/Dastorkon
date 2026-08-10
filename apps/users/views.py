from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User
from .permissions import IsAdminRole, IsWaiterRole
from .serializers import AdminUserSerializer, WaiterShiftSerializer
from .services import (
    end_waiter_shift,
    get_active_waiter_shift,
    start_waiter_shift,
)


class AdminUserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = AdminUserSerializer
    permission_classes = (IsAdminRole,)

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list":
            queryset = queryset.filter(is_active=True)
        return queryset

    def perform_update(self, serializer):
        if serializer.instance == self.request.user and serializer.validated_data.get("is_active") is False:
            raise ValidationError({"is_active": "You cannot deactivate your own account."})
        serializer.save()

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise ValidationError("You cannot deactivate your own account.")
        instance.is_active = False
        instance.save(update_fields=("is_active",))


class WaiterShiftStartView(APIView):
    permission_classes = (IsWaiterRole,)

    def post(self, request):
        shift = start_waiter_shift(request.user)
        return Response(WaiterShiftSerializer(shift).data)


class WaiterShiftEndView(APIView):
    permission_classes = (IsWaiterRole,)

    def post(self, request):
        try:
            shift = end_waiter_shift(request.user)
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages) from exc
        return Response(WaiterShiftSerializer(shift).data)


class CurrentWaiterShiftView(APIView):
    permission_classes = (IsWaiterRole,)

    def get(self, request):
        shift = get_active_waiter_shift(request.user)
        if shift is None:
            return Response(None, status=status.HTTP_200_OK)
        return Response(WaiterShiftSerializer(shift).data)
