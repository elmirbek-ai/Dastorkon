from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.notifications.services import (
    build_table_session_notification_payload,
    notify_kitchen,
    notify_waiters,
)

from .models import ActiveTableSession, CustomerSession, RestaurantTable


def get_table_by_qr_token(qr_token):
    try:
        return RestaurantTable.objects.get(qr_token=qr_token, is_active=True)
    except RestaurantTable.DoesNotExist as exc:
        raise ValidationError("Table not found or inactive.") from exc


@transaction.atomic
def get_or_create_active_table_session(table):
    table = RestaurantTable.objects.select_for_update().get(pk=table.pk)
    active_session = (
        ActiveTableSession.objects.select_for_update()
        .filter(table=table, status=ActiveTableSession.Status.ACTIVE)
        .first()
    )
    if active_session:
        return active_session

    active_session = ActiveTableSession.objects.create(
        restaurant=table.restaurant,
        table=table,
    )
    table.status = RestaurantTable.Status.OCCUPIED
    table.save(update_fields=("status", "updated_at"))
    return active_session


def create_customer_session(active_table_session=None, *, table=None):
    if table is None:
        table = active_table_session.table
    return CustomerSession.objects.create(
        table=table,
        active_table_session=active_table_session,
    )


@transaction.atomic
def activate_customer_session(customer_session):
    customer_snapshot = CustomerSession.objects.select_related("table").get(
        pk=customer_session.pk
    )
    if not customer_snapshot.is_active:
        raise ValidationError("Customer session is inactive.")
    if not customer_snapshot.table.is_active:
        raise ValidationError("Table not found or inactive.")

    table_session = get_or_create_active_table_session(customer_snapshot.table)
    customer_session = (
        CustomerSession.objects.select_for_update()
        .select_related("table", "active_table_session")
        .get(pk=customer_snapshot.pk)
    )
    if not customer_session.is_active:
        raise ValidationError("Customer session is inactive.")
    if not customer_session.table.is_active:
        raise ValidationError("Table not found or inactive.")
    if customer_session.table_id != table_session.table_id:
        raise ValidationError("Customer session table does not match.")
    if customer_session.active_table_session_id not in (None, table_session.pk):
        raise ValidationError("Customer session table does not match.")
    if customer_session.active_table_session_id == table_session.pk:
        return customer_session, table_session

    customer_session.active_table_session = table_session
    customer_session.save(update_fields=("active_table_session", "updated_at"))
    return customer_session, table_session


@transaction.atomic
def close_active_table_session(active_table_session, closed_by_user=None):
    closed_at = timezone.now()
    active_table_session.status = ActiveTableSession.Status.CLOSED
    active_table_session.closed_at = closed_at
    active_table_session.save(update_fields=("status", "closed_at", "updated_at"))

    active_table_session.customer_sessions.update(
        is_active=False,
        closed_at=closed_at,
    )

    table = active_table_session.table
    table.status = RestaurantTable.Status.FREE
    table.save(update_fields=("status", "updated_at"))
    payload = build_table_session_notification_payload(active_table_session)
    transaction.on_commit(
        lambda: notify_waiters("table_session_closed", payload)
    )
    transaction.on_commit(
        lambda: notify_kitchen("table_session_closed", payload)
    )
    return active_table_session
