from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.menu.models import MenuItem, MenuItemModifierGroup
from apps.notifications.services import (
    build_order_notification_payload,
    build_table_session_notification_payload,
    build_waiter_call_notification_payload,
    notify_admins,
    notify_kitchen,
    notify_waiters,
    send_notification_to_user,
)
from apps.tables.models import ActiveTableSession, CustomerSession, RestaurantTable
from apps.tables.services import (
    close_active_table_session,
    get_or_create_active_table_session,
)
from apps.users.models import User
from apps.users.services import get_active_waiter_shift

from .models import (
    ITEM_COMMENT_MAX_LENGTH,
    CartItem,
    CartItemModifierSelection,
    Order,
    OrderItem,
    OrderItemModifierSnapshot,
    OrderStatusHistory,
    WaiterCall,
)


def normalize_item_comment(comment):
    normalized_comment = str(comment or "").strip()
    if len(normalized_comment) > ITEM_COMMENT_MAX_LENGTH:
        raise ValidationError(
            f"Item comment cannot exceed {ITEM_COMMENT_MAX_LENGTH} characters."
        )
    return normalized_comment


def validate_menu_item_for_customer_session(customer_session, menu_item):
    if not customer_session.is_active:
        raise ValidationError("Customer session is inactive.")

    table_session = customer_session.active_table_session
    if table_session.status != ActiveTableSession.Status.ACTIVE:
        raise ValidationError("Table session is not active.")
    if (
        menu_item.restaurant_id != table_session.restaurant_id
        or menu_item.is_deleted
        or not menu_item.is_visible
        or not menu_item.is_available
        or menu_item.category.is_deleted
        or not menu_item.category.is_visible
    ):
        raise ValidationError("Menu item is unavailable.")


def validate_selected_modifiers(menu_item, selected_modifiers=None):
    selected_modifiers = selected_modifiers or []
    groups = list(
        MenuItemModifierGroup.objects.filter(menu_item=menu_item)
        .prefetch_related("options")
        .order_by("sort_order", "id")
    )
    groups_by_id = {group.pk: group for group in groups}
    selections_by_group = {}

    for selection in selected_modifiers:
        group_id = selection.get("group_id")
        option_ids = selection.get("option_ids", [])
        if group_id in selections_by_group:
            raise ValidationError("A modifier group can be selected only once.")
        if len(option_ids) != len(set(option_ids)):
            raise ValidationError("Duplicate modifier options are not allowed.")

        group = groups_by_id.get(group_id)
        if group is None or not group.is_active:
            raise ValidationError("Modifier group is unavailable.")
        options_by_id = {option.pk: option for option in group.options.all()}
        selected_options = []
        for option_id in option_ids:
            option = options_by_id.get(option_id)
            if option is None:
                raise ValidationError(
                    "Modifier option does not belong to the selected group."
                )
            if not option.is_active or not option.is_available:
                raise ValidationError("Modifier option is unavailable.")
            selected_options.append(option)
        selections_by_group[group_id] = selected_options

    validated = []
    for group in groups:
        if not group.is_active:
            continue
        options = selections_by_group.get(group.pk, [])
        count = len(options)
        if group.is_required and count == 0:
            raise ValidationError("A required modifier group is missing.")
        if group.selection_type == MenuItemModifierGroup.SelectionType.SINGLE:
            if count > 1:
                raise ValidationError(
                    "Single-selection modifier groups allow only one option."
                )
        elif count:
            if count < group.min_selected:
                raise ValidationError(
                    "Too few options were selected for a modifier group."
                )
            if group.max_selected is not None and count > group.max_selected:
                raise ValidationError(
                    "Too many options were selected for a modifier group."
                )
        if count:
            validated.append(
                {
                    "group": group,
                    "options": sorted(
                        options,
                        key=lambda option: (option.sort_order, option.pk),
                    ),
                }
            )
    return validated


def modifier_selection_signature(validated_modifiers):
    return tuple(
        sorted(
            option.pk
            for selection in validated_modifiers
            for option in selection["options"]
        )
    )


def cart_item_selection_signature(cart_item):
    return tuple(
        sorted(
            selection.option_id
            for selection in cart_item.modifier_selections.all()
        )
    )


def cart_item_unit_price(cart_item):
    modifier_total = sum(
        (
            selection.option.price_delta
            for selection in cart_item.modifier_selections.all()
        ),
        Decimal("0"),
    )
    return cart_item.menu_item.price + modifier_total


@transaction.atomic
def add_cart_item(
    customer_session,
    menu_item,
    quantity=1,
    comment="",
    selected_modifiers=None,
):
    customer_session = (
        CustomerSession.objects.select_for_update()
        .select_related("active_table_session")
        .get(pk=customer_session.pk)
    )
    menu_item = MenuItem.objects.get(pk=menu_item.pk)
    validate_menu_item_for_customer_session(customer_session, menu_item)
    if quantity <= 0:
        raise ValidationError("Quantity must be greater than zero.")
    comment = normalize_item_comment(comment)
    validated_modifiers = validate_selected_modifiers(
        menu_item,
        selected_modifiers,
    )
    requested_signature = modifier_selection_signature(validated_modifiers)

    cart_items = list(
        CartItem.objects.select_for_update()
        .filter(
            customer_session=customer_session,
            menu_item=menu_item,
            comment=comment,
        )
        .prefetch_related("modifier_selections__option")
    )
    for cart_item in cart_items:
        if cart_item_selection_signature(cart_item) == requested_signature:
            cart_item.quantity += quantity
            cart_item.save(update_fields=("quantity", "updated_at"))
            return cart_item

    cart_item = CartItem.objects.create(
        customer_session=customer_session,
        menu_item=menu_item,
        quantity=quantity,
        comment=comment,
    )
    CartItemModifierSelection.objects.bulk_create(
        [
            CartItemModifierSelection(
                cart_item=cart_item,
                group=selection["group"],
                option=option,
            )
            for selection in validated_modifiers
            for option in selection["options"]
        ]
    )
    return cart_item


@transaction.atomic
def update_cart_item(cart_item, quantity=None, comment=None):
    cart_item = (
        CartItem.objects.select_for_update()
        .select_related(
            "customer_session__active_table_session",
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
        cart_item.comment = normalize_item_comment(comment)
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
        customer_session.active_table_session.status
        != ActiveTableSession.Status.ACTIVE
    ):
        raise ValidationError("Table session is not active.")
    return CartItem.objects.filter(
        customer_session=customer_session,
    ).select_related("menu_item").prefetch_related(
        "modifier_selections__group",
        "modifier_selections__option",
    )


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
    if reason not in WaiterCall.Reason.values:
        raise ValidationError("Invalid waiter call reason.")

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
        transaction.on_commit(
            lambda: send_notification_to_user(
                waiter_id,
                "waiter_call_created",
                payload,
            )
        )
    else:
        transaction.on_commit(
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
    transaction.on_commit(
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
    transaction.on_commit(
        lambda: notify_admins("waiter_call_completed", payload)
    )
    transaction.on_commit(
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
        validated_modifiers = validate_selected_modifiers(
            menu_item,
            item_data.get("selected_modifiers"),
        )
        modifier_total = sum(
            (
                option.price_delta
                for selection in validated_modifiers
                for option in selection["options"]
            ),
            Decimal("0"),
        )
        total_price = (menu_item.price + modifier_total) * quantity
        total_amount += total_price
        validated_items.append(
            {
                "menu_item": menu_item,
                "quantity": quantity,
                "comment": normalize_item_comment(item_data.get("comment", "")),
                "total_price": total_price,
                "modifiers": validated_modifiers,
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
        order_item = OrderItem.objects.create(
            order=order,
            menu_item=item["menu_item"],
            name_ky_at_order=item["menu_item"].name_ky,
            name_ru_at_order=item["menu_item"].name_ru,
            price_at_order=item["menu_item"].price,
            quantity=item["quantity"],
            comment=item["comment"],
            total_price=item["total_price"],
        )
        OrderItemModifierSnapshot.objects.bulk_create(
            [
                OrderItemModifierSnapshot(
                    order_item=order_item,
                    group_name_ky=selection["group"].name_ky,
                    group_name_ru=selection["group"].name_ru,
                    option_name_ky=option.name_ky,
                    option_name_ru=option.name_ru,
                    price_delta=option.price_delta,
                    group_sort_order=selection["group"].sort_order,
                    option_sort_order=option.sort_order,
                )
                for selection in item["modifiers"]
                for option in selection["options"]
            ]
        )
    OrderStatusHistory.objects.create(
        order=order,
        from_status="",
        to_status=Order.Status.NEW,
    )
    payload = build_order_notification_payload(order)
    transaction.on_commit(lambda: notify_kitchen("order_created", payload))
    waiter_id = table_session.assigned_waiter_id
    if waiter_id:
        transaction.on_commit(
            lambda: send_notification_to_user(
                waiter_id,
                "order_created",
                payload,
            )
        )
    else:
        transaction.on_commit(
            lambda: notify_waiters("order_available", payload)
        )
    return order


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
        .select_related("active_table_session")
        .get(pk=customer_session.pk)
    )
    if not customer_session.is_active:
        raise ValidationError("Customer session is inactive.")

    cart_items = list(
        CartItem.objects.select_for_update()
        .select_related("menu_item")
        .prefetch_related("modifier_selections__option")
        .filter(customer_session=customer_session)
    )
    if not cart_items:
        raise ValidationError("Cart is empty.")

    order = create_order(
        customer_session,
        [
            {
                "menu_item": cart_item.menu_item,
                "quantity": cart_item.quantity,
                "comment": cart_item.comment,
                "selected_modifiers": [
                    {
                        "group_id": group_id,
                        "option_ids": [
                            selection.option_id
                            for selection in cart_item.modifier_selections.all()
                            if selection.group_id == group_id
                        ],
                    }
                    for group_id in sorted(
                        {
                            selection.group_id
                            for selection in cart_item.modifier_selections.all()
                        }
                    )
                ],
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
    transaction.on_commit(
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
    transaction.on_commit(
        lambda: notify_kitchen("order_preparing", payload)
    )
    return order


@transaction.atomic
def mark_order_ready(order, user=None):
    order = change_order_status(order, Order.Status.READY, user)
    payload = build_order_notification_payload(order)
    transaction.on_commit(lambda: notify_kitchen("order_ready", payload))
    waiter_id = order.table_session.assigned_waiter_id
    if waiter_id:
        transaction.on_commit(
            lambda: send_notification_to_user(
                waiter_id,
                "order_ready",
                payload,
            )
        )
    else:
        transaction.on_commit(lambda: notify_waiters("order_ready", payload))
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
    transaction.on_commit(lambda: notify_kitchen("order_delivered", payload))
    waiter_id = order.responsible_waiter_id or order.table_session.assigned_waiter_id
    if waiter_id:
        transaction.on_commit(
            lambda: send_notification_to_user(
                waiter_id,
                "order_delivered",
                payload,
            )
        )
    else:
        transaction.on_commit(
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
