from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Sum
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tables.models import ActiveTableSession, CustomerSession
from apps.tables.services import get_table_by_qr_token

from .models import CartItem, Order
from .serializers import (
    CartItemCreateSerializer,
    CartItemSerializer,
    CartItemUpdateSerializer,
    PublicOrderSerializer,
)
from .services import (
    add_cart_item,
    calculate_cart_total,
    create_order_from_cart,
    get_cart_items,
    remove_cart_item,
    update_cart_item,
)


class CustomerSessionMixin:
    permission_classes = (AllowAny,)

    def get_customer_session(self, request, qr_token):
        try:
            table = get_table_by_qr_token(qr_token)
        except DjangoValidationError as exc:
            raise NotFound("QR table not found.") from exc

        session_key = request.COOKIES.get("customer_session_key")
        if not session_key:
            raise PermissionDenied("Customer session cookie is required.")

        try:
            customer_session = (
                CustomerSession.objects.select_related("active_table_session")
                .filter(
                    session_key=session_key,
                    is_active=True,
                    active_table_session__table=table,
                    active_table_session__status=ActiveTableSession.Status.ACTIVE,
                )
                .first()
            )
        except DjangoValidationError as exc:
            raise PermissionDenied("Customer session cookie is invalid.") from exc
        if customer_session is None:
            raise PermissionDenied("Customer session cookie is invalid.")
        return customer_session

    def raise_service_error(self, exc):
        raise ValidationError(exc.messages) from exc


class PublicCartView(CustomerSessionMixin, APIView):
    def get(self, request, qr_token):
        customer_session = self.get_customer_session(request, qr_token)
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
            return CartItem.objects.select_related("menu_item").get(
                pk=item_id,
                customer_session=customer_session,
            )
        except CartItem.DoesNotExist as exc:
            raise NotFound("Cart item not found.") from exc

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

    def delete(self, request, qr_token, item_id):
        customer_session = self.get_customer_session(request, qr_token)
        cart_item = self.get_cart_item(customer_session, item_id)
        remove_cart_item(cart_item)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublicOrderView(CustomerSessionMixin, APIView):
    def get(self, request, qr_token):
        customer_session = self.get_customer_session(request, qr_token)
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
                "total_amount": f"{total_amount:.2f}",
            }
        )

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
