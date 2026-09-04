from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.common.business_time import get_business_timezone, get_local_day_range

from .models import User, WaiterShift


WAITER_HAS_ACTIVE_WORK_CODE = "WAITER_HAS_ACTIVE_WORK"
WAITER_HAS_ACTIVE_WORK_DETAIL = (
    "Complete assigned active tables, orders, and calls before ending the shift."
)
WAITER_ACCESS_CHANGE_ACTIVE_WORK_DETAIL = (
    "Complete the waiter's active shift and assigned work before changing access."
)


def validate_waiter(waiter):
    if not waiter.is_authenticated or waiter.pk is None:
        raise ValidationError("Authenticated waiter is required.")
    if waiter.role != User.Role.WAITER:
        raise ValidationError("User is not a waiter.")


def get_active_waiter_shift(waiter):
    return WaiterShift.objects.filter(waiter=waiter, is_active=True).first()


@transaction.atomic
def get_waiter_active_work_counts(waiter):
    from apps.orders.models import Order, WaiterCall
    from apps.tables.models import ActiveTableSession

    active_session_ids = list(
        ActiveTableSession.objects.select_for_update()
        .filter(
            assigned_waiter=waiter,
            status=ActiveTableSession.Status.ACTIVE,
        )
        .values_list("pk", flat=True)
    )
    unfinished_order_ids = list(
        Order.objects.select_for_update()
        .filter(
            table_session_id__in=active_session_ids,
            status__in=(
                Order.Status.NEW,
                Order.Status.PREPARING,
                Order.Status.READY,
                Order.Status.DELIVERED,
            ),
        )
        .values_list("pk", flat=True)
    )
    unresolved_call_ids = list(
        WaiterCall.objects.select_for_update()
        .filter(
            assigned_waiter=waiter,
            status__in=(
                WaiterCall.Status.NEW,
                WaiterCall.Status.ACCEPTED,
            ),
        )
        .values_list("pk", flat=True)
    )
    return {
        "active_tables": len(active_session_ids),
        "unfinished_orders": len(unfinished_order_ids),
        "unresolved_calls": len(unresolved_call_ids),
    }


@transaction.atomic
def validate_waiter_access_change(waiter, *, next_is_active, next_role):
    waiter = User.objects.select_for_update().get(pk=waiter.pk)
    is_deactivating = waiter.is_active and next_is_active is False
    is_changing_role = (
        waiter.role == User.Role.WAITER
        and next_role != User.Role.WAITER
    )
    if waiter.role != User.Role.WAITER or not (
        is_deactivating or is_changing_role
    ):
        return waiter

    active_shift_ids = list(
        WaiterShift.objects.select_for_update()
        .filter(waiter=waiter, is_active=True)
        .values_list("pk", flat=True)
    )
    active_work = {
        "active_shifts": len(active_shift_ids),
        **get_waiter_active_work_counts(waiter),
    }
    if any(active_work.values()):
        raise ValidationError(
            WAITER_ACCESS_CHANGE_ACTIVE_WORK_DETAIL,
            code=WAITER_HAS_ACTIVE_WORK_CODE,
            params=active_work,
        )
    return waiter


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

    active_work = get_waiter_active_work_counts(waiter)
    if any(active_work.values()):
        raise ValidationError(
            WAITER_HAS_ACTIVE_WORK_DETAIL,
            code=WAITER_HAS_ACTIVE_WORK_CODE,
            params=active_work,
        )

    active_shift.is_active = False
    active_shift.ended_at = timezone.now()
    active_shift.save(update_fields=("is_active", "ended_at"))
    return active_shift


def _overlap_seconds(started_at, ended_at, window_start, window_end):
    interval_start = max(started_at, window_start)
    interval_end = min(ended_at, window_end)
    if interval_end <= interval_start:
        return 0
    return int((interval_end - interval_start).total_seconds())


def format_duration(seconds, language="ky"):
    total_minutes = max(0, int(seconds or 0)) // 60
    days, remaining_minutes = divmod(total_minutes, 24 * 60)
    hours, minutes = divmod(remaining_minutes, 60)
    parts = []
    if days:
        if language == "ru":
            suffix = (
                "день"
                if days == 1
                else "дня"
                if 2 <= days % 10 <= 4 and not 12 <= days % 100 <= 14
                else "дней"
            )
            parts.append(f"{days} {suffix}")
        else:
            parts.append(f"{days} күн")
    if hours:
        parts.append(f"{hours} ч" if language == "ru" else f"{hours} саат")
    if minutes or not parts:
        parts.append(f"{minutes} мин" if language == "ru" else f"{minutes} мүнөт")
    return " ".join(parts)


def _request_language(request):
    requested = request.query_params.get("lang", "").lower()
    if requested in ("ky", "ru"):
        return requested
    accept_language = request.headers.get("Accept-Language", "").lower()
    return "ru" if accept_language.startswith("ru") else "ky"


def build_waiter_shift_summary(waiter, request, now=None):
    now = now or timezone.now()
    business_timezone = get_business_timezone()
    local_today = timezone.localtime(now, business_timezone).date()
    today_start, tomorrow_start = get_local_day_range(local_today)
    seven_day_start, _ = get_local_day_range(local_today - timedelta(days=6))
    thirty_day_start, _ = get_local_day_range(local_today - timedelta(days=29))
    language = _request_language(request)

    window_shifts = list(
        WaiterShift.objects.filter(waiter=waiter, started_at__lt=tomorrow_start)
        .filter(Q(ended_at__gte=thirty_day_start) | Q(ended_at__isnull=True))
        .order_by("-started_at")
    )
    current_shift = next(
        (shift for shift in window_shifts if shift.ended_at is None),
        None,
    )

    def worked_seconds(window_start):
        return sum(
            _overlap_seconds(
                shift.started_at,
                shift.ended_at or now,
                window_start,
                min(now, tomorrow_start),
            )
            for shift in window_shifts
        )

    today_shifts = [
        shift
        for shift in window_shifts
        if shift.started_at < tomorrow_start and (shift.ended_at or now) > today_start
    ]
    today_seconds = worked_seconds(today_start)
    seven_day_seconds = worked_seconds(seven_day_start)
    thirty_day_seconds = worked_seconds(thirty_day_start)
    recent_shifts = list(WaiterShift.objects.filter(waiter=waiter).order_by("-started_at")[:30])

    return {
        "shift_summary": {
            "is_on_shift": current_shift is not None,
            "current_shift_id": current_shift.pk if current_shift else None,
            "today_shift_started_at": min(
                (shift.started_at for shift in today_shifts),
                default=None,
            ),
            "today_shift_ended_at": (
                None
                if any(shift.ended_at is None for shift in today_shifts)
                else max((shift.ended_at for shift in today_shifts), default=None)
            ),
            "today_worked_seconds": today_seconds,
            "today_worked_display": format_duration(today_seconds, language),
            "last_7_days_worked_seconds": seven_day_seconds,
            "last_7_days_worked_display": format_duration(seven_day_seconds, language),
            "last_30_days_worked_seconds": thirty_day_seconds,
            "last_30_days_worked_display": format_duration(thirty_day_seconds, language),
            "total_shifts_count": WaiterShift.objects.filter(waiter=waiter).count(),
        },
        "recent_shifts": [
            {
                "id": shift.pk,
                "date": timezone.localtime(shift.started_at, business_timezone).date(),
                "started_at": shift.started_at,
                "ended_at": shift.ended_at,
                "is_active": shift.ended_at is None,
                "duration_seconds": max(
                    0,
                    int(((shift.ended_at or now) - shift.started_at).total_seconds()),
                ),
                "duration_display": format_duration(
                    max(
                        0,
                        int(((shift.ended_at or now) - shift.started_at).total_seconds()),
                    ),
                    language,
                ),
            }
            for shift in recent_shifts
        ],
    }


def build_waiter_work_stats(waiter, request):
    from apps.orders.models import Order, OrderStatusHistory, WaiterCall
    from apps.tables.models import ActiveTableSession

    language = _request_language(request)
    assigned_sessions = ActiveTableSession.objects.filter(assigned_waiter=waiter)
    waiter_orders = Order.objects.filter(responsible_waiter=waiter)
    histories = (
        OrderStatusHistory.objects.filter(
            order__responsible_waiter=waiter,
            order__status__in=(Order.Status.DELIVERED, Order.Status.COMPLETED),
            to_status__in=(Order.Status.READY, Order.Status.DELIVERED),
        )
        .values("order_id", "to_status", "created_at")
        .order_by("order_id", "created_at")
    )
    delivery_times = {}
    delivery_durations = []
    for history in histories:
        order_times = delivery_times.setdefault(history["order_id"], {})
        if history["to_status"] == Order.Status.READY:
            order_times.setdefault("ready", history["created_at"])
        elif "ready" in order_times and "delivered" not in order_times:
            order_times["delivered"] = history["created_at"]
            duration = int((order_times["delivered"] - order_times["ready"]).total_seconds())
            if duration >= 0:
                delivery_durations.append(duration)

    average_seconds = (
        round(sum(delivery_durations) / len(delivery_durations))
        if delivery_durations
        else None
    )
    no_data = "Пока нет данных" if language == "ru" else "Азырынча маалымат жок"
    return {
        "accepted_tables_count": assigned_sessions.count(),
        "delivered_orders_count": waiter_orders.filter(
            status__in=(Order.Status.DELIVERED, Order.Status.COMPLETED)
        ).count(),
        "resolved_waiter_calls_count": WaiterCall.objects.filter(
            assigned_waiter=waiter,
            status=WaiterCall.Status.DONE,
        ).count(),
        "today_active_tables_count": assigned_sessions.filter(
            status=ActiveTableSession.Status.ACTIVE
        ).count(),
        "today_ready_not_delivered_orders_count": Order.objects.filter(
            table_session__assigned_waiter=waiter,
            status=Order.Status.READY
        ).count(),
        "average_order_delivery_time_seconds": average_seconds,
        "average_order_delivery_time_display": (
            format_duration(average_seconds, language)
            if average_seconds is not None
            else no_data
        ),
    }
