from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsWaiterRole
from .serializers import WaiterShiftSerializer
from .services import (
    end_waiter_shift,
    get_active_waiter_shift,
    start_waiter_shift,
)


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
