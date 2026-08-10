from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

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


def create_customer_session(active_table_session):
    return CustomerSession.objects.create(
        active_table_session=active_table_session,
    )


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
    return active_table_session
