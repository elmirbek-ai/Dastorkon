from datetime import datetime, time, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, DecimalField, Prefetch, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.menu.models import MenuItem
from apps.tables.models import (
    ActiveTableSession,
    CustomerSession,
    RestaurantTable,
)
from apps.tables.services import get_table_by_qr_token
from apps.users.permissions import IsKitchenRole, IsWaiterRole
from apps.users.permissions import IsAdminRole
from apps.users.services import get_active_waiter_shift

from .models import CartItem, Order, WaiterCall
from .serializers import (
    CartItemCreateSerializer,
    CartItemSerializer,
    CartItemUpdateSerializer,
    AdminOrderDetailSerializer,
    AdminOrderFilterSerializer,
    AdminOrderListSerializer,
    KitchenOrderSerializer,
    ManualOrderCreateSerializer,
    ManualOrderMenuItemSerializer,
    ManualOrderMenuQuerySerializer,
    ManualOrderTableSerializer,
    PublicOrderSerializer,
    PublicWaiterCallSerializer,
    WaiterCallCreateSerializer,
    WaiterCallSerializer,
    WaiterOrderSerializer,
    WaiterTableSessionSerializer,
)
from .services import (
    COMMENTS_DISABLED_CODE,
    TABLE_HAS_UNRESOLVED_CALLS_CODE,
    add_cart_item,
    accept_waiter_call,
    assign_waiter_to_table_session,
    calculate_cart_total,
    complete_table_session,
    complete_waiter_call,
    create_manual_order,
    create_waiter_call,
    create_order_from_cart,
    get_cart_items,
    mark_order_delivered,
    mark_order_preparing,
    mark_order_ready,
    remove_cart_item,
    update_cart_item,
)


PublicCartResponseSchema = inline_serializer(
    name="PublicCartResponse",
    fields={
        "items": CartItemSerializer(many=True),
        "total": drf_serializers.DecimalField(max_digits=10, decimal_places=2),
    },
)
PublicOrdersResponseSchema = inline_serializer(
    name="PublicOrdersResponse",
    fields={
        "orders": PublicOrderSerializer(many=True),
        "read_only": drf_serializers.BooleanField(),
        "total_amount": drf_serializers.DecimalField(
            max_digits=10,
            decimal_places=2,
        ),
    },
)


class CustomerSessionMixin:
    permission_classes = (AllowAny,)

    def get_customer_session(self, request, qr_token, *, allow_closed=False):
        try:
            table = get_table_by_qr_token(qr_token)
        except DjangoValidationError as exc:
            raise NotFound("QR table not found.") from exc

        session_key = request.COOKIES.get("customer_session_key")
        if not session_key:
            raise PermissionDenied("Customer session cookie is required.")

        try:
            customer_session = (
                CustomerSession.objects.select_related(
                    "table",
                    "active_table_session",
                )
                .filter(
                    session_key=session_key,
                    table=table,
                )
                .first()
            )
        except DjangoValidationError as exc:
            raise PermissionDenied("Customer session cookie is invalid.") from exc
        if customer_session is None:
            raise PermissionDenied("Customer session cookie is invalid.")
        if customer_session.is_active:
            return customer_session
        if (
            allow_closed
            and customer_session.active_table_session is not None
            and customer_session.active_table_session.status
            == ActiveTableSession.Status.CLOSED
        ):
            return customer_session
        raise PermissionDenied("Customer session is closed.")

    def raise_service_error(self, exc):
        if getattr(exc, "code", None) == COMMENTS_DISABLED_CODE:
            raise ValidationError(
                {
                    "code": COMMENTS_DISABLED_CODE,
                    "detail": exc.message,
                }
            ) from exc
        raise ValidationError(exc.messages) from exc


class PublicCartView(CustomerSessionMixin, APIView):
    @extend_schema(responses=PublicCartResponseSchema)
    def get(self, request, qr_token):
        customer_session = self.get_customer_session(
            request,
            qr_token,
            allow_closed=True,
        )
        if not customer_session.is_active:
            return Response({"items": [], "total": "0.00"})
        try:
            cart_items = get_cart_items(customer_session)
            total = calculate_cart_total(customer_session)
        except DjangoValidationError as exc:
            self.raise_service_error(exc)
        return Response(
            {
                "items": CartItemSerializer(cart_items, many=True).data,
                "total": f"{total:.2f}",
            }
        )


class PublicCartItemCreateView(CustomerSessionMixin, APIView):
    @extend_schema(
        request=CartItemCreateSerializer,
        responses={201: CartItemSerializer},
    )
    def post(self, request, qr_token):
        customer_session = self.get_customer_session(request, qr_token)
        serializer = CartItemCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cart_item = add_cart_item(
                customer_session=customer_session,
                **serializer.validated_data,
            )
        except DjangoValidationError as exc:
            self.raise_service_error(exc)
        return Response(
            CartItemSerializer(cart_item).data,
            status=status.HTTP_201_CREATED,
        )


class PublicCartItemDetailView(CustomerSessionMixin, APIView):
    def get_cart_item(self, customer_session, item_id):
        try:
            return (
                CartItem.objects.select_related("menu_item")
                .get(
                    pk=item_id,
                    customer_session=customer_session,
                )
            )
        except CartItem.DoesNotExist as exc:
            raise NotFound("Cart item not found.") from exc

    @extend_schema(
        request=CartItemUpdateSerializer,
        responses=CartItemSerializer,
    )
    def patch(self, request, qr_token, item_id):
        customer_session = self.get_customer_session(request, qr_token)
        cart_item = self.get_cart_item(customer_session, item_id)
        serializer = CartItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            cart_item = update_cart_item(
                cart_item,
                **serializer.validated_data,
            )
        except DjangoValidationError as exc:
            self.raise_service_error(exc)
        return Response(CartItemSerializer(cart_item).data)

    @extend_schema(
        request=None,
        responses={204: OpenApiResponse(description="Cart item removed.")},
    )
    def delete(self, request, qr_token, item_id):
        customer_session = self.get_customer_session(request, qr_token)
        cart_item = self.get_cart_item(customer_session, item_id)
        remove_cart_item(cart_item)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublicOrderView(CustomerSessionMixin, APIView):
    @extend_schema(responses=PublicOrdersResponseSchema)
    def get(self, request, qr_token):
        customer_session = self.get_customer_session(
            request,
            qr_token,
            allow_closed=True,
        )
        orders = Order.objects.filter(
            customer_session=customer_session,
        ).prefetch_related("items")
        total_amount = (
            orders.exclude(status=Order.Status.CANCELLED).aggregate(
                total=Sum("total_amount")
            )["total"]
            or Decimal("0")
        )
        return Response(
            {
                "orders": PublicOrderSerializer(orders, many=True).data,
                "read_only": not customer_session.is_active,
                "total_amount": f"{total_amount:.2f}",
            }
        )

    @extend_schema(request=None, responses={201: PublicOrderSerializer})
    def post(self, request, qr_token):
        customer_session = self.get_customer_session(request, qr_token)
        try:
            order = create_order_from_cart(customer_session)
        except DjangoValidationError as exc:
            self.raise_service_error(exc)
        return Response(
            PublicOrderSerializer(order).data,
            status=status.HTTP_201_CREATED,
        )


def table_sessions_with_totals():
    return (
        ActiveTableSession.objects.select_related(
            "table",
            "restaurant",
            "assigned_waiter",
        )
        .annotate(
            orders_count=Count("orders"),
            total_amount=Coalesce(
                Sum("orders__total_amount"),
                Value(Decimal("0.00")),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ),
        )
    )


class ActiveWaiterShiftMixin:
    permission_classes = (IsWaiterRole,)

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if get_active_waiter_shift(request.user) is None:
            raise PermissionDenied("An active waiter shift is required.")

    def raise_service_error(self, exc):
        raise ValidationError(exc.messages) from exc


class ManualOrderTablesView(ActiveWaiterShiftMixin, APIView):
    @extend_schema(responses=ManualOrderTableSerializer(many=True))
    def get(self, request):
        tables = (
            RestaurantTable.objects.filter(is_active=True)
            .select_related("restaurant")
            .prefetch_related(
                Prefetch(
                    "sessions",
                    queryset=ActiveTableSession.objects.filter(
                        status=ActiveTableSession.Status.ACTIVE,
                    ).select_related("assigned_waiter"),
                    to_attr="active_sessions",
                )
            )
            .order_by("restaurant__name", "number")
        )
        response_data = []
        for table in tables:
            active_session = table.active_sessions[0] if table.active_sessions else None
            assigned_waiter = (
                active_session.assigned_waiter if active_session else None
            )
            assigned_to_current_waiter = (
                assigned_waiter is not None
                and assigned_waiter.pk == request.user.pk
            )
            can_use = assigned_waiter is None or assigned_to_current_waiter
            response_data.append(
                {
                    "id": table.pk,
                    "number": table.number,
                    "restaurant": table.restaurant_id,
                    "restaurant_name": table.restaurant.name,
                    "status": table.status,
                    "active_session_id": (
                        active_session.pk if active_session else None
                    ),
                    "assigned_waiter": (
                        assigned_waiter.pk if assigned_waiter else None
                    ),
                    "assigned_waiter_username": (
                        assigned_waiter.username if assigned_waiter else None
                    ),
                    "is_assigned_to_current_waiter": assigned_to_current_waiter,
                    "can_use": can_use,
                    "unavailable_reason": (
                        "ASSIGNED_TO_ANOTHER_WAITER" if not can_use else ""
                    ),
                }
            )
        return Response(ManualOrderTableSerializer(response_data, many=True).data)


class ManualOrderMenuItemsView(ActiveWaiterShiftMixin, APIView):
    @extend_schema(
        parameters=[ManualOrderMenuQuerySerializer],
        responses=ManualOrderMenuItemSerializer(many=True),
    )
    def get(self, request):
        query_serializer = ManualOrderMenuQuerySerializer(
            data=request.query_params,
        )
        query_serializer.is_valid(raise_exception=True)
        try:
            table = RestaurantTable.objects.get(
                pk=query_serializer.validated_data["table_id"],
                is_active=True,
            )
        except RestaurantTable.DoesNotExist as exc:
            raise NotFound("Table not found or inactive.") from exc

        menu_items = (
            MenuItem.objects.filter(
                restaurant=table.restaurant,
                is_deleted=False,
                is_visible=True,
                category__is_deleted=False,
                category__is_visible=True,
            )
            .select_related("category")
            .order_by("category__sort_order", "category__name_ky", "name_ky")
        )
        return Response(
            ManualOrderMenuItemSerializer(
                menu_items,
                many=True,
                context={"request": request},
            ).data
        )


class ManualOrderCreateView(ActiveWaiterShiftMixin, APIView):
    @extend_schema(
        request=ManualOrderCreateSerializer,
        responses={201: WaiterOrderSerializer},
    )
    def post(self, request):
        serializer = ManualOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order = create_manual_order(
                request.user,
                serializer.validated_data["table_id"],
                serializer.validated_data["items"],
            )
        except DjangoValidationError as exc:
            self.raise_service_error(exc)
        order = (
            Order.objects.select_related(
                "table_session__table",
                "responsible_waiter",
            )
            .prefetch_related("items")
            .get(pk=order.pk)
        )
        return Response(
            WaiterOrderSerializer(order).data,
            status=status.HTTP_201_CREATED,
        )


class AvailableTableSessionsView(ActiveWaiterShiftMixin, APIView):
    @extend_schema(responses=WaiterTableSessionSerializer(many=True))
    def get(self, request):
        table_sessions = (
            table_sessions_with_totals()
            .filter(
                status=ActiveTableSession.Status.ACTIVE,
                assigned_waiter__isnull=True,
                orders_count__gt=0,
            )
            .order_by("created_at")
        )
        return Response(
            WaiterTableSessionSerializer(table_sessions, many=True).data
        )


class MyTableSessionsView(ActiveWaiterShiftMixin, APIView):
    @extend_schema(responses=WaiterTableSessionSerializer(many=True))
    def get(self, request):
        table_sessions = (
            table_sessions_with_totals()
            .filter(
                status=ActiveTableSession.Status.ACTIVE,
                assigned_waiter=request.user,
            )
            .order_by("-created_at")
        )
        return Response(
            WaiterTableSessionSerializer(table_sessions, many=True).data
        )


class AcceptTableSessionView(ActiveWaiterShiftMixin, APIView):
    @extend_schema(request=None, responses=WaiterTableSessionSerializer)
    def post(self, request, session_id):
        try:
            table_session = ActiveTableSession.objects.get(pk=session_id)
        except ActiveTableSession.DoesNotExist as exc:
            raise NotFound("Table session not found.") from exc
        try:
            table_session = assign_waiter_to_table_session(
                table_session,
                request.user,
            )
        except DjangoValidationError as exc:
            self.raise_service_error(exc)
        table_session = table_sessions_with_totals().get(pk=table_session.pk)
        return Response(WaiterTableSessionSerializer(table_session).data)


class MyOrdersView(ActiveWaiterShiftMixin, APIView):
    @extend_schema(responses=WaiterOrderSerializer(many=True))
    def get(self, request):
        orders = (
            Order.objects.filter(table_session__assigned_waiter=request.user)
            .exclude(status__in=(Order.Status.COMPLETED, Order.Status.CANCELLED))
            .select_related("table_session__table")
            .prefetch_related("items")
            .order_by("-created_at")
        )
        return Response(WaiterOrderSerializer(orders, many=True).data)


class MarkOrderDeliveredView(ActiveWaiterShiftMixin, APIView):
    @extend_schema(request=None, responses=WaiterOrderSerializer)
    def post(self, request, order_id):
        try:
            order = Order.objects.get(pk=order_id)
        except Order.DoesNotExist as exc:
            raise NotFound("Order not found.") from exc
        try:
            order = mark_order_delivered(order, request.user)
        except DjangoValidationError as exc:
            self.raise_service_error(exc)
        order = (
            Order.objects.select_related("table_session__table")
            .prefetch_related("items")
            .get(pk=order.pk)
        )
        return Response(WaiterOrderSerializer(order).data)


class CloseTableSessionView(ActiveWaiterShiftMixin, APIView):
    @extend_schema(request=None, responses=WaiterTableSessionSerializer)
    def post(self, request, session_id):
        try:
            table_session = ActiveTableSession.objects.get(pk=session_id)
        except ActiveTableSession.DoesNotExist as exc:
            raise NotFound("Table session not found.") from exc
        if table_session.assigned_waiter_id != request.user.pk:
            raise PermissionDenied("Table session is assigned to another waiter.")
        try:
            table_session = complete_table_session(
                table_session,
                request.user,
            )
        except DjangoValidationError as exc:
            if getattr(exc, "code", None) == TABLE_HAS_UNRESOLVED_CALLS_CODE:
                return Response(
                    {
                        "code": TABLE_HAS_UNRESOLVED_CALLS_CODE,
                        "detail": exc.message,
                        **(exc.params or {}),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            self.raise_service_error(exc)
        table_session = table_sessions_with_totals().get(pk=table_session.pk)
        return Response(WaiterTableSessionSerializer(table_session).data)


class KitchenOrdersView(APIView):
    permission_classes = (IsKitchenRole,)

    @extend_schema(responses=KitchenOrderSerializer(many=True))
    def get(self, request):
        orders = (
            Order.objects.filter(
                status__in=(
                    Order.Status.NEW,
                    Order.Status.PREPARING,
                    Order.Status.READY,
                ),
            )
            .select_related("table_session__table")
            .prefetch_related("items")
            .order_by("created_at")
        )
        return Response(KitchenOrderSerializer(orders, many=True).data)


class MarkOrderPreparingView(APIView):
    permission_classes = (IsKitchenRole,)

    @extend_schema(request=None, responses=KitchenOrderSerializer)
    def post(self, request, order_id):
        try:
            order = Order.objects.get(pk=order_id)
        except Order.DoesNotExist as exc:
            raise NotFound("Order not found.") from exc
        try:
            order = mark_order_preparing(order, user=request.user)
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages) from exc
        order = (
            Order.objects.select_related("table_session__table")
            .prefetch_related("items")
            .get(pk=order.pk)
        )
        return Response(KitchenOrderSerializer(order).data)


class MarkOrderReadyView(APIView):
    permission_classes = (IsKitchenRole,)

    @extend_schema(request=None, responses=KitchenOrderSerializer)
    def post(self, request, order_id):
        try:
            order = Order.objects.get(pk=order_id)
        except Order.DoesNotExist as exc:
            raise NotFound("Order not found.") from exc
        try:
            order = mark_order_ready(order, user=request.user)
        except DjangoValidationError as exc:
            raise ValidationError(exc.messages) from exc
        order = (
            Order.objects.select_related("table_session__table")
            .prefetch_related("items")
            .get(pk=order.pk)
        )
        return Response(KitchenOrderSerializer(order).data)


class PublicWaiterCallCreateView(CustomerSessionMixin, APIView):
    @extend_schema(
        request=WaiterCallCreateSerializer,
        responses={201: PublicWaiterCallSerializer},
    )
    def post(self, request, qr_token):
        customer_session = self.get_customer_session(request, qr_token)
        serializer = WaiterCallCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            waiter_call = create_waiter_call(
                customer_session,
                serializer.validated_data["reason"],
            )
        except DjangoValidationError as exc:
            self.raise_service_error(exc)
        return Response(
            PublicWaiterCallSerializer(waiter_call).data,
            status=status.HTTP_201_CREATED,
        )


class WaiterCallsView(ActiveWaiterShiftMixin, APIView):
    @extend_schema(responses=WaiterCallSerializer(many=True))
    def get(self, request):
        waiter_calls = (
            WaiterCall.objects.filter(
                status__in=(WaiterCall.Status.NEW, WaiterCall.Status.ACCEPTED),
            )
            .filter(
                Q(assigned_waiter=request.user)
                | Q(table_session__assigned_waiter=request.user)
                | Q(
                    assigned_waiter__isnull=True,
                    table_session__assigned_waiter__isnull=True,
                )
            )
            .select_related("table_session__table", "assigned_waiter")
            .order_by("created_at")
        )
        return Response(WaiterCallSerializer(waiter_calls, many=True).data)


class AcceptWaiterCallView(ActiveWaiterShiftMixin, APIView):
    @extend_schema(request=None, responses=WaiterCallSerializer)
    def post(self, request, call_id):
        try:
            waiter_call = WaiterCall.objects.get(pk=call_id)
        except WaiterCall.DoesNotExist as exc:
            raise NotFound("Waiter call not found.") from exc
        try:
            waiter_call = accept_waiter_call(waiter_call, request.user)
        except DjangoValidationError as exc:
            self.raise_service_error(exc)
        waiter_call = WaiterCall.objects.select_related(
            "table_session__table",
            "assigned_waiter",
        ).get(pk=waiter_call.pk)
        return Response(WaiterCallSerializer(waiter_call).data)


class CompleteWaiterCallView(ActiveWaiterShiftMixin, APIView):
    @extend_schema(request=None, responses=WaiterCallSerializer)
    def post(self, request, call_id):
        try:
            waiter_call = WaiterCall.objects.get(pk=call_id)
        except WaiterCall.DoesNotExist as exc:
            raise NotFound("Waiter call not found.") from exc
        try:
            waiter_call = complete_waiter_call(waiter_call, request.user)
        except DjangoValidationError as exc:
            self.raise_service_error(exc)
        waiter_call = WaiterCall.objects.select_related(
            "table_session__table",
            "assigned_waiter",
        ).get(pk=waiter_call.pk)
        return Response(WaiterCallSerializer(waiter_call).data)


def _local_day_bounds(day):
    current_timezone = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(day, time.min), current_timezone)
    end = timezone.make_aware(
        datetime.combine(day + timedelta(days=1), time.min),
        current_timezone,
    )
    return start, end


def filter_admin_orders(queryset, filters):
    if "restaurant" in filters:
        queryset = queryset.filter(restaurant_id=filters["restaurant"])
    if "table" in filters:
        queryset = queryset.filter(table_session__table_id=filters["table"])
    if "waiter" in filters:
        queryset = queryset.filter(responsible_waiter_id=filters["waiter"])
    if "status" in filters:
        queryset = queryset.filter(status=filters["status"])
    if "date" in filters:
        day_start, next_day_start = _local_day_bounds(filters["date"])
        queryset = queryset.filter(
            created_at__gte=day_start,
            created_at__lt=next_day_start,
        )
        return queryset
    if "date_from" in filters:
        range_start, _ = _local_day_bounds(filters["date_from"])
        queryset = queryset.filter(created_at__gte=range_start)
    if "date_to" in filters:
        _, range_end = _local_day_bounds(filters["date_to"])
        queryset = queryset.filter(created_at__lt=range_end)
    return queryset


class AdminOrdersView(APIView):
    permission_classes = (IsAdminRole,)

    @extend_schema(
        operation_id="admin_orders_list",
        parameters=[AdminOrderFilterSerializer],
        responses=AdminOrderListSerializer(many=True),
    )
    def get(self, request):
        filter_serializer = AdminOrderFilterSerializer(data=request.query_params)
        filter_serializer.is_valid(raise_exception=True)
        orders = (
            Order.objects.select_related(
                "restaurant",
                "table_session__table",
                "customer_session",
                "responsible_waiter",
            )
            .annotate(items_count=Count("items"))
            .order_by("-created_at")
        )
        orders = filter_admin_orders(orders, filter_serializer.validated_data)
        return Response(AdminOrderListSerializer(orders, many=True).data)


class AdminOrderDetailView(APIView):
    permission_classes = (IsAdminRole,)

    @extend_schema(
        operation_id="admin_orders_retrieve",
        responses=AdminOrderDetailSerializer,
    )
    def get(self, request, order_id):
        try:
            order = (
                Order.objects.select_related(
                    "restaurant",
                    "table_session__table",
                    "customer_session",
                    "responsible_waiter",
                )
                .prefetch_related(
                    "items",
                    "status_history__changed_by",
                )
                .get(pk=order_id)
            )
        except Order.DoesNotExist as exc:
            raise NotFound("Order not found.") from exc
        return Response(AdminOrderDetailSerializer(order).data)
