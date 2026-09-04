from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.menu.models import MenuItem
from apps.notifications.services import (
    build_order_notification_payload,
    build_table_session_notification_payload,
    build_waiter_call_notification_payload,
    enqueue_notification_on_commit,
    notify_admins,
    notify_kitchen,
    notify_waiters,
    send_notification_to_user,
)
from apps.restaurants.models import RestaurantSettings
from apps.tables.models import ActiveTableSession, CustomerSession, RestaurantTable
from apps.tables.services import (
    activate_customer_session,
    close_active_table_session,
    get_or_create_active_table_session,
)
from apps.users.models import User
from apps.users.services import get_active_waiter_shift

from .models import (
    ITEM_COMMENT_MAX_LENGTH,
    CartItem,
    Order,
    OrderItem,
    OrderStatusHistory,
    WaiterCall,
)


TABLE_HAS_UNRESOLVED_CALLS_CODE = "TABLE_HAS_UNRESOLVED_CALLS"
TABLE_HAS_UNRESOLVED_CALLS_DETAIL = (
    "Complete all waiter calls before closing the table session."
)
COMMENTS_DISABLED_CODE = "COMMENTS_DISABLED"
COMMENTS_DISABLED_DETAIL = "Customer item comments are disabled."


def normalize_item_comment(comment):
    normalized_comment = str(comment or "").strip()
    if len(normalized_comment) > ITEM_COMMENT_MAX_LENGTH:
        raise ValidationError(
            f"Item comment cannot exceed {ITEM_COMMENT_MAX_LENGTH} characters."
        )
    return normalized_comment


def normalize_customer_item_comment(customer_session, comment):
    normalized_comment = str(comment or "").strip()
    if normalized_comment and RestaurantSettings.objects.filter(
        restaurant_id=customer_session.table.restaurant_id,
        comments_enabled=False,
    ).exists():
        raise ValidationError(
            COMMENTS_DISABLED_DETAIL,
            code=COMMENTS_DISABLED_CODE,
        )
    return normalize_item_comment(normalized_comment)


def validate_menu_item_for_customer_session(customer_session, menu_item):
    if not customer_session.is_active:
        raise ValidationError("Customer session is inactive.")
    if not customer_session.table.is_active:
        raise ValidationError("Table not found or inactive.")
    table_session = customer_session.active_table_session
    if (
        table_session is not None
        and table_session.status != ActiveTableSession.Status.ACTIVE
    ):
        raise ValidationError("Table session is not active.")
    if (
        menu_item.restaurant_id != customer_session.table.restaurant_id
        or menu_item.is_deleted
        or not menu_item.is_visible
        or not menu_item.is_available
        or menu_item.category.is_deleted
        or not menu_item.category.is_visible
    ):
        raise ValidationError("Menu item is unavailable.")


def cart_item_unit_price(cart_item):
    return cart_item.menu_item.price


@transaction.atomic
def add_cart_item(
    customer_session,
    menu_item,
    quantity=1,
    comment="",
):
    customer_session = (
        CustomerSession.objects.select_for_update()
        .select_related("table", "active_table_session")
        .get(pk=customer_session.pk)
    )
    menu_item = MenuItem.objects.get(pk=menu_item.pk)
    validate_menu_item_for_customer_session(customer_session, menu_item)
    if quantity <= 0:
        raise ValidationError("Quantity must be greater than zero.")
    comment = normalize_customer_item_comment(customer_session, comment)
    cart_item = (
        CartItem.objects.select_for_update()
        .filter(
            customer_session=customer_session,
            menu_item=menu_item,
            comment=comment,
        )
        .first()
    )
    if cart_item is not None:
        cart_item.quantity += quantity
        cart_item.save(update_fields=("quantity", "updated_at"))
        return cart_item

    return CartItem.objects.create(
        customer_session=customer_session,
        menu_item=menu_item,
        quantity=quantity,
        comment=comment,
    )


@transaction.atomic
def update_cart_item(cart_item, quantity=None, comment=None):
    cart_item = (
        CartItem.objects.select_for_update()
        .select_related(
            "customer_session__active_table_session",
            "customer_session__table",
            "menu_item",
        )
        .get(pk=cart_item.pk)
    )
    validate_menu_item_for_customer_session(
        cart_item.customer_session,
        cart_item.menu_item,
    )

    update_fields = []
    if quantity is not None:
        if quantity <= 0:
            raise ValidationError("Quantity must be greater than zero.")
        cart_item.quantity = quantity
        update_fields.append("quantity")
    if comment is not None:
        cart_item.comment = normalize_customer_item_comment(
            cart_item.customer_session,
            comment,
        )
        update_fields.append("comment")
    if update_fields:
        cart_item.save(update_fields=(*update_fields, "updated_at"))
    return cart_item


def remove_cart_item(cart_item):
    cart_item.delete()
    return None


def get_cart_items(customer_session):
    if not customer_session.is_active:
        raise ValidationError("Customer session is inactive.")
    if (
        not customer_session.table.is_active
        or (
            customer_session.active_table_session is not None
            and customer_session.active_table_session.status
            != ActiveTableSession.Status.ACTIVE
        )
    ):
        raise ValidationError("Table session is not active.")
    return CartItem.objects.filter(
        customer_session=customer_session,
    ).select_related("menu_item")


def calculate_cart_total(customer_session):
    return sum(
        (
            cart_item_unit_price(cart_item) * cart_item.quantity
            for cart_item in get_cart_items(customer_session)
        ),
        Decimal("0"),
    )


def clear_cart(customer_session):
    CartItem.objects.filter(customer_session=customer_session).delete()


@transaction.atomic
def create_waiter_call(customer_session, reason):
    if reason not in WaiterCall.Reason.values:
        raise ValidationError("Invalid waiter call reason.")
    customer_session, table_session = activate_customer_session(
        customer_session
    )

    waiter_call = WaiterCall.objects.create(
        restaurant=table_session.restaurant,
        table_session=table_session,
        customer_session=customer_session,
        assigned_waiter=table_session.assigned_waiter,
        reason=reason,
        status=WaiterCall.Status.NEW,
    )
    payload = build_waiter_call_notification_payload(waiter_call)
    waiter_id = waiter_call.assigned_waiter_id
    if waiter_id:
        enqueue_notification_on_commit(
            lambda: send_notification_to_user(
                waiter_id,
                "waiter_call_created",
                payload,
            )
        )
    else:
        enqueue_notification_on_commit(
            lambda: notify_waiters("waiter_call_available", payload)
        )
    return waiter_call


def validate_active_waiter(waiter):
    if waiter.role != User.Role.WAITER:
        raise ValidationError("User is not a waiter.")
    if get_active_waiter_shift(waiter) is None:
        raise ValidationError("Waiter has no active shift.")


@transaction.atomic
def accept_waiter_call(waiter_call, waiter):
    validate_active_waiter(waiter)
    waiter_call = (
        WaiterCall.objects.select_for_update()
        .select_related("table_session")
        .get(pk=waiter_call.pk)
    )
    if waiter_call.status not in (
        WaiterCall.Status.NEW,
        WaiterCall.Status.ACCEPTED,
    ):
        raise ValidationError("Waiter call cannot be accepted.")
    if waiter_call.table_session.status != ActiveTableSession.Status.ACTIVE:
        raise ValidationError("Table session is not active.")
    if waiter_call.assigned_waiter_id not in (None, waiter.pk):
        raise ValidationError("Waiter call is assigned to another waiter.")

    table_session = waiter_call.table_session
    if table_session.assigned_waiter_id not in (None, waiter.pk):
        raise ValidationError("Table session is assigned to another waiter.")
    if table_session.assigned_waiter_id is None:
        table_session = assign_waiter_to_table_session(table_session, waiter)

    waiter_call.assigned_waiter = waiter
    waiter_call.status = WaiterCall.Status.ACCEPTED
    if waiter_call.accepted_at is None:
        waiter_call.accepted_at = timezone.now()
    waiter_call.save(
        update_fields=(
            "assigned_waiter",
            "status",
            "accepted_at",
            "updated_at",
        )
    )
    payload = build_waiter_call_notification_payload(waiter_call)
    enqueue_notification_on_commit(
        lambda: notify_waiters("waiter_call_accepted", payload)
    )
    return waiter_call


@transaction.atomic
def complete_waiter_call(waiter_call, waiter):
    validate_active_waiter(waiter)
    waiter_call = WaiterCall.objects.select_for_update().get(pk=waiter_call.pk)
    if waiter_call.assigned_waiter_id != waiter.pk:
        raise ValidationError("Waiter call is assigned to another waiter.")
    if waiter_call.status != WaiterCall.Status.ACCEPTED:
        raise ValidationError("Waiter call is not accepted.")

    waiter_call.status = WaiterCall.Status.DONE
    waiter_call.completed_at = timezone.now()
    waiter_call.save(update_fields=("status", "completed_at", "updated_at"))
    payload = build_waiter_call_notification_payload(waiter_call)
    enqueue_notification_on_commit(
        lambda: notify_admins("waiter_call_completed", payload)
    )
    enqueue_notification_on_commit(
        lambda: send_notification_to_user(
            waiter_call.assigned_waiter_id,
            "waiter_call_completed",
            payload,
        )
    )
    return waiter_call


@transaction.atomic
def generate_order_number():
    latest_order = Order.objects.select_for_update().order_by("-id").first()
    next_number = latest_order.id + 1 if latest_order else 1
    return f"ORD-{next_number:06d}"


def _create_order_record(
    table_session,
    items_data,
    *,
    customer_session,
    source,
    responsible_waiter,
):
    if not items_data:
        raise ValidationError("Order items cannot be empty.")
    validated_items = []
    total_amount = Decimal("0")
    for item_data in items_data:
        menu_item_value = item_data.get("menu_item")
        menu_item_id = getattr(
            menu_item_value,
            "pk",
            item_data.get("menu_item_id"),
        )
        menu_item = (
            MenuItem.objects.select_related("category")
            .filter(pk=menu_item_id)
            .first()
        )
        if (
            menu_item is None
            or menu_item.is_deleted
            or not menu_item.is_visible
            or not menu_item.is_available
            or menu_item.category.is_deleted
            or not menu_item.category.is_visible
            or menu_item.restaurant_id != table_session.restaurant_id
        ):
            raise ValidationError("Menu item is unavailable.")

        quantity = item_data["quantity"]
        if quantity <= 0:
            raise ValidationError("Quantity must be greater than zero.")
        total_price = menu_item.price * quantity
        total_amount += total_price
        validated_items.append(
            {
                "menu_item": menu_item,
                "quantity": quantity,
                "comment": normalize_item_comment(item_data.get("comment", "")),
                "total_price": total_price,
            }
        )

    order = Order.objects.create(
        restaurant=table_session.restaurant,
        table_session=table_session,
        customer_session=customer_session,
        source=source,
        order_number=generate_order_number(),
        responsible_waiter=responsible_waiter,
        status=Order.Status.NEW,
        total_amount=total_amount,
    )
    for item in validated_items:
        OrderItem.objects.create(
            order=order,
            menu_item=item["menu_item"],
            name_ky_at_order=item["menu_item"].name_ky,
            name_ru_at_order=item["menu_item"].name_ru,
            price_at_order=item["menu_item"].price,
            quantity=item["quantity"],
            comment=item["comment"],
            total_price=item["total_price"],
        )
    OrderStatusHistory.objects.create(
        order=order,
        from_status="",
        to_status=Order.Status.NEW,
    )
    payload = build_order_notification_payload(order)
    enqueue_notification_on_commit(
        lambda: notify_kitchen("order_created", payload)
    )
    waiter_id = table_session.assigned_waiter_id
    if waiter_id:
        enqueue_notification_on_commit(
            lambda: send_notification_to_user(
                waiter_id,
                "order_created",
                payload,
            )
        )
    else:
        enqueue_notification_on_commit(
            lambda: notify_waiters("order_available", payload)
        )
    return order


@transaction.atomic
def create_order(customer_session, items_data):
    customer_session, table_session = activate_customer_session(
        customer_session
    )

    return _create_order_record(
        table_session,
        items_data,
        customer_session=customer_session,
        source=Order.Source.CUSTOMER_QR,
        responsible_waiter=table_session.assigned_waiter,
    )


@transaction.atomic
def create_manual_order(waiter, table_id, items_data):
    validate_active_waiter(waiter)
    try:
        table = (
            RestaurantTable.objects.select_for_update()
            .select_related("restaurant")
            .get(pk=table_id, is_active=True)
        )
    except RestaurantTable.DoesNotExist as exc:
        raise ValidationError("Table not found or inactive.") from exc

    table_session = get_or_create_active_table_session(table)
    if table_session.assigned_waiter_id not in (None, waiter.pk):
        raise ValidationError("Table session is assigned to another waiter.")
    if table_session.assigned_waiter_id is None:
        table_session = assign_waiter_to_table_session(table_session, waiter)

    return _create_order_record(
        table_session,
        items_data,
        customer_session=None,
        source=Order.Source.WAITER_MANUAL,
        responsible_waiter=waiter,
    )


@transaction.atomic
def create_order_from_cart(customer_session):
    customer_session = (
        CustomerSession.objects.select_for_update()
        .select_related("table", "active_table_session")
        .get(pk=customer_session.pk)
    )
    if not customer_session.is_active:
        raise ValidationError("Customer session is inactive.")

    cart_items = list(
        CartItem.objects.select_for_update()
        .select_related("menu_item")
        .filter(customer_session=customer_session)
    )
    if not cart_items:
        raise ValidationError("Cart is empty.")

    for cart_item in cart_items:
        normalize_customer_item_comment(customer_session, cart_item.comment)

    order = create_order(
        customer_session,
        [
            {
                "menu_item": cart_item.menu_item,
                "quantity": cart_item.quantity,
                "comment": cart_item.comment,
            }
            for cart_item in cart_items
        ],
    )
    clear_cart(customer_session)
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
    payload = build_table_session_notification_payload(active_table_session)
    enqueue_notification_on_commit(
        lambda: notify_waiters("table_session_assigned", payload)
    )
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


@transaction.atomic
def mark_order_preparing(order, user=None):
    order = change_order_status(order, Order.Status.PREPARING, user)
    payload = build_order_notification_payload(order)
    enqueue_notification_on_commit(
        lambda: notify_kitchen("order_preparing", payload)
    )
    return order


@transaction.atomic
def mark_order_ready(order, user=None):
    order = change_order_status(order, Order.Status.READY, user)
    payload = build_order_notification_payload(order)
    enqueue_notification_on_commit(
        lambda: notify_kitchen("order_ready", payload)
    )
    waiter_id = order.table_session.assigned_waiter_id
    if waiter_id:
        enqueue_notification_on_commit(
            lambda: send_notification_to_user(
                waiter_id,
                "order_ready",
                payload,
            )
        )
    else:
        enqueue_notification_on_commit(
            lambda: notify_waiters("order_ready", payload)
        )
    return order


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
    if order.responsible_waiter_id is None:
        order.responsible_waiter = waiter
        order.save(update_fields=("responsible_waiter", "updated_at"))
    order = change_order_status(order, Order.Status.DELIVERED, waiter)
    payload = build_order_notification_payload(order)
    enqueue_notification_on_commit(
        lambda: notify_kitchen("order_delivered", payload)
    )
    waiter_id = order.responsible_waiter_id or order.table_session.assigned_waiter_id
    if waiter_id:
        enqueue_notification_on_commit(
            lambda: send_notification_to_user(
                waiter_id,
                "order_delivered",
                payload,
            )
        )
    else:
        enqueue_notification_on_commit(
            lambda: notify_waiters("order_delivered", payload)
        )
    return order


@transaction.atomic
def complete_table_session(active_table_session, user):
    active_table_session = ActiveTableSession.objects.select_for_update().get(
        pk=active_table_session.pk,
    )
    if active_table_session.status != ActiveTableSession.Status.ACTIVE:
        raise ValidationError("Table session is not active.")
    unresolved_call_ids = list(
        WaiterCall.objects.select_for_update()
        .filter(
            table_session=active_table_session,
            status__in=(
                WaiterCall.Status.NEW,
                WaiterCall.Status.ACCEPTED,
            ),
        )
        .values_list("pk", flat=True)
    )
    if unresolved_call_ids:
        raise ValidationError(
            TABLE_HAS_UNRESOLVED_CALLS_DETAIL,
            code=TABLE_HAS_UNRESOLVED_CALLS_CODE,
            params={"unresolved_calls": len(unresolved_call_ids)},
        )
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
