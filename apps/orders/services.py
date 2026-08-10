from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.menu.models import MenuItem
from apps.tables.models import ActiveTableSession, CustomerSession
from apps.tables.services import close_active_table_session
from apps.users.models import User

from .models import Order, OrderItem, OrderStatusHistory


@transaction.atomic
def generate_order_number():
    latest_order = Order.objects.select_for_update().order_by("-id").first()
    next_number = latest_order.id + 1 if latest_order else 1
    return f"ORD-{next_number:06d}"


@transaction.atomic
def create_order(customer_session, items_data):
    table_session = (
        ActiveTableSession.objects.select_for_update()
        .select_related("restaurant", "assigned_waiter")
        .get(pk=customer_session.active_table_session_id)
    )
    customer_session = CustomerSession.objects.select_for_update().get(
        pk=customer_session.pk,
        active_table_session=table_session,
    )

    if not customer_session.is_active:
        raise ValidationError("Customer session is inactive.")
    if table_session.status != ActiveTableSession.Status.ACTIVE:
        raise ValidationError("Table session is not active.")

    validated_items = []
    total_amount = Decimal("0")
    for item_data in items_data:
        menu_item = MenuItem.objects.filter(pk=item_data["menu_item"].pk).first()
        if (
            menu_item is None
            or menu_item.is_deleted
            or not menu_item.is_visible
            or not menu_item.is_available
            or menu_item.restaurant_id != table_session.restaurant_id
        ):
            raise ValidationError("Menu item is unavailable.")

        quantity = item_data["quantity"]
        total_price = menu_item.price * quantity
        total_amount += total_price
        validated_items.append(
            {
                "menu_item": menu_item,
                "quantity": quantity,
                "comment": item_data.get("comment", ""),
                "total_price": total_price,
            }
        )

    order = Order.objects.create(
        restaurant=table_session.restaurant,
        table_session=table_session,
        customer_session=customer_session,
        order_number=generate_order_number(),
        responsible_waiter=table_session.assigned_waiter,
        status=Order.Status.NEW,
        total_amount=total_amount,
    )
    OrderItem.objects.bulk_create(
        [
            OrderItem(
                order=order,
                menu_item=item["menu_item"],
                name_ky_at_order=item["menu_item"].name_ky,
                name_ru_at_order=item["menu_item"].name_ru,
                price_at_order=item["menu_item"].price,
                quantity=item["quantity"],
                comment=item["comment"],
                total_price=item["total_price"],
            )
            for item in validated_items
        ]
    )
    OrderStatusHistory.objects.create(
        order=order,
        from_status="",
        to_status=Order.Status.NEW,
    )
    return order


@transaction.atomic
def assign_waiter_to_table_session(active_table_session, waiter):
    active_table_session = ActiveTableSession.objects.select_for_update().get(
        pk=active_table_session.pk,
    )
    if active_table_session.status != ActiveTableSession.Status.ACTIVE:
        raise ValidationError("Table session is not active.")
    if waiter.role != User.Role.WAITER:
        raise ValidationError("User is not a waiter.")
    if not waiter.shifts.filter(is_active=True).exists():
        raise ValidationError("Waiter has no active shift.")

    if active_table_session.assigned_waiter_id == waiter.pk:
        return active_table_session
    if active_table_session.assigned_waiter_id is not None:
        raise ValidationError("Table session is assigned to another waiter.")

    active_table_session.assigned_waiter = waiter
    active_table_session.save(update_fields=("assigned_waiter", "updated_at"))
    active_table_session.orders.filter(
        status=Order.Status.NEW,
        responsible_waiter__isnull=True,
    ).update(responsible_waiter=waiter)
    return active_table_session


@transaction.atomic
def change_order_status(order, new_status, changed_by=None):
    order = Order.objects.select_for_update().get(pk=order.pk)
    allowed_transitions = {
        Order.Status.NEW: Order.Status.PREPARING,
        Order.Status.PREPARING: Order.Status.READY,
        Order.Status.READY: Order.Status.DELIVERED,
        Order.Status.DELIVERED: Order.Status.COMPLETED,
    }
    if allowed_transitions.get(order.status) != new_status:
        raise ValidationError("Invalid order status transition.")

    previous_status = order.status
    order.status = new_status
    order.save(update_fields=("status", "updated_at"))
    OrderStatusHistory.objects.create(
        order=order,
        from_status=previous_status,
        to_status=new_status,
        changed_by=changed_by,
    )
    return order


def mark_order_preparing(order, user=None):
    return change_order_status(order, Order.Status.PREPARING, user)


def mark_order_ready(order, user=None):
    return change_order_status(order, Order.Status.READY, user)


@transaction.atomic
def mark_order_delivered(order, waiter):
    order = (
        Order.objects.select_for_update()
        .select_related("table_session")
        .get(pk=order.pk)
    )
    if waiter.pk is None or (
        waiter.pk != order.responsible_waiter_id
        and waiter.pk != order.table_session.assigned_waiter_id
    ):
        raise ValidationError("Waiter is not assigned to this order.")
    return change_order_status(order, Order.Status.DELIVERED, waiter)


@transaction.atomic
def complete_table_session(active_table_session, user):
    active_table_session = ActiveTableSession.objects.select_for_update().get(
        pk=active_table_session.pk,
    )
    if active_table_session.status != ActiveTableSession.Status.ACTIVE:
        raise ValidationError("Table session is not active.")
    orders = Order.objects.select_for_update().filter(
        table_session=active_table_session,
    )
    blocking_statuses = (
        Order.Status.NEW,
        Order.Status.PREPARING,
        Order.Status.READY,
    )
    if orders.filter(status__in=blocking_statuses).exists():
        raise ValidationError("Table session has unfinished orders.")

    for order in orders.filter(status=Order.Status.DELIVERED):
        change_order_status(order, Order.Status.COMPLETED, user)

    return close_active_table_session(active_table_session, closed_by_user=user)
