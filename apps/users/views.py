from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .models import User
from .permissions import IsAdminRole, IsWaiterRole
from .serializers import (
    AdminUserSerializer,
    CurrentUserSerializer,
    WaiterProfileSerializer,
    WaiterProfileUpdateSerializer,
    WaiterShiftSerializer,
    RoleTokenObtainPairSerializer,
    RoleTokenRefreshSerializer,
)
from .services import (
    build_waiter_shift_summary,
    build_waiter_work_stats,
    end_waiter_shift,
    get_active_waiter_shift,
    start_waiter_shift,
)


class RoleTokenObtainPairView(TokenObtainPairView):
    serializer_class = RoleTokenObtainPairSerializer


class RoleTokenRefreshView(TokenRefreshView):
    serializer_class = RoleTokenRefreshSerializer


class AdminUserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = AdminUserSerializer
    permission_classes = (IsAdminRole,)

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list" and self.request.query_params.get("include_inactive") != "true":
            queryset = queryset.filter(is_active=True)
        if self.action == "list":
            role = self.request.query_params.get("role", "").strip()
            roles_value = self.request.query_params.get("roles", "").strip()
            if role and roles_value:
                raise ValidationError(
                    {"role": "Use either role or roles, not both."}
                )
            valid_roles = {choice for choice, _ in User.Role.choices}
            if role:
                if role not in valid_roles:
                    raise ValidationError({"role": "Invalid user role."})
                queryset = queryset.filter(role=role)
            elif roles_value:
                roles = {value.strip() for value in roles_value.split(",") if value.strip()}
                if not roles or not roles.issubset(valid_roles):
                    raise ValidationError({"roles": "Invalid user roles."})
                queryset = queryset.filter(role__in=roles)
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


class CurrentUserView(APIView):
    @extend_schema(responses=CurrentUserSerializer)
    def get(self, request):
        return Response(CurrentUserSerializer(request.user).data)


class WaiterProfileView(APIView):
    permission_classes = (IsWaiterRole,)

    def _response_data(self, request):
        shift_data = build_waiter_shift_summary(request.user, request)
        return {
            "profile": WaiterProfileSerializer(
                request.user,
                context={"request": request},
            ).data,
            **shift_data,
            "work_stats": build_waiter_work_stats(request.user, request),
        }

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(self._response_data(request))

    @extend_schema(
        request=WaiterProfileUpdateSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def patch(self, request):
        serializer = WaiterProfileUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self._response_data(request))


class WaiterShiftStartView(APIView):
    permission_classes = (IsWaiterRole,)

    @extend_schema(request=None, responses=WaiterShiftSerializer)
    def post(self, request):
        shift = start_waiter_shift(request.user)
        return Response(WaiterShiftSerializer(shift).data)


class WaiterShiftEndView(APIView):
    permission_classes = (IsWaiterRole,)

    @extend_schema(request=None, responses=WaiterShiftSerializer)
    def post(self, request):
        try:
            shift = end_waiter_shift(request.user)
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages) from exc
        return Response(WaiterShiftSerializer(shift).data)


class CurrentWaiterShiftView(APIView):
    permission_classes = (IsWaiterRole,)

    @extend_schema(responses=WaiterShiftSerializer)
    def get(self, request):
        shift = get_active_waiter_shift(request.user)
        if shift is None:
            return Response(None, status=status.HTTP_200_OK)
        return Response(WaiterShiftSerializer(shift).data)
