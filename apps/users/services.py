from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .models import User, WaiterShift


def validate_waiter(waiter):
    if not waiter.is_authenticated or waiter.pk is None:
        raise ValidationError("Authenticated waiter is required.")
    if waiter.role != User.Role.WAITER:
        raise ValidationError("User is not a waiter.")


def get_active_waiter_shift(waiter):
    return WaiterShift.objects.filter(waiter=waiter, is_active=True).first()


@transaction.atomic
def start_waiter_shift(waiter):
    validate_waiter(waiter)
    waiter = User.objects.select_for_update().get(pk=waiter.pk)
    active_shift = get_active_waiter_shift(waiter)
    if active_shift:
        return active_shift
    return WaiterShift.objects.create(waiter=waiter)


@transaction.atomic
def end_waiter_shift(waiter):
    validate_waiter(waiter)
    waiter = User.objects.select_for_update().get(pk=waiter.pk)
    active_shift = (
        WaiterShift.objects.select_for_update()
        .filter(waiter=waiter, is_active=True)
        .first()
    )
    if active_shift is None:
        raise ValidationError("Waiter has no active shift.")

    active_shift.is_active = False
    active_shift.ended_at = timezone.now()
    active_shift.save(update_fields=("is_active", "ended_at"))
    return active_shift
