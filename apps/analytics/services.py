from datetime import datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count, DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.orders.models import Order, OrderItem, OrderStatusHistory
from apps.tables.models import ActiveTableSession, RestaurantTable


def build_comparison(current, previous):
    if previous is None:
        return {
            "value": current,
            "previous": None,
            "delta_percent": None,
            "trend": "unavailable",
        }

    if current > previous:
        trend = "up"
    elif current < previous:
        trend = "down"
    else:
        trend = "neutral"

    if previous == 0:
        delta_percent = 0 if current == 0 else None
    else:
        difference = (Decimal(current) - Decimal(previous)) / Decimal(previous)
        delta_percent = int(
            (difference * Decimal("100")).quantize(
                Decimal("1"),
                rounding=ROUND_HALF_UP,
            )
        )

    return {
        "value": current,
        "previous": previous,
        "delta_percent": delta_percent,
        "trend": trend,
    }


def local_day_bounds(day):
    current_timezone = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(day, time.min), current_timezone)
    end = timezone.make_aware(
        datetime.combine(day + timedelta(days=1), time.min),
        current_timezone,
    )
    return start, end


def get_dashboard_kpis(restaurant_id=None, now=None):
    now = now or timezone.now()
    local_now = timezone.localtime(now)
    today = local_now.date()
    yesterday = today - timedelta(days=1)
    today_start, tomorrow_start = local_day_bounds(today)
    yesterday_start, _ = local_day_bounds(yesterday)

    orders = Order.objects.all()
    completed_history = OrderStatusHistory.objects.filter(
        to_status=Order.Status.COMPLETED,
    )
    table_sessions = ActiveTableSession.objects.all()
    tables = RestaurantTable.objects.filter(is_active=True)
    if restaurant_id is not None:
        orders = orders.filter(restaurant_id=restaurant_id)
        completed_history = completed_history.filter(
            order__restaurant_id=restaurant_id,
        )
        table_sessions = table_sessions.filter(restaurant_id=restaurant_id)
        tables = tables.filter(restaurant_id=restaurant_id)

    today_orders = orders.filter(
        created_at__gte=today_start,
        created_at__lt=tomorrow_start,
    )
    yesterday_orders = orders.filter(
        created_at__gte=yesterday_start,
        created_at__lt=today_start,
    )
    today_completed = completed_history.filter(
        created_at__gte=today_start,
        created_at__lt=tomorrow_start,
    ).values("order_id").distinct().count()
    yesterday_completed = completed_history.filter(
        created_at__gte=yesterday_start,
        created_at__lt=today_start,
    ).values("order_id").distinct().count()

    money_field = DecimalField(max_digits=14, decimal_places=2)

    def revenue_for(queryset):
        return queryset.exclude(status=Order.Status.CANCELLED).aggregate(
            total=Coalesce(
                Sum("total_amount"),
                Value(Decimal("0")),
                output_field=money_field,
            )
        )["total"]

    current_active_tables = table_sessions.filter(
        status=ActiveTableSession.Status.ACTIVE,
    ).values("table_id").distinct().count()
    previous_snapshot = timezone.make_aware(
        datetime.combine(
            yesterday,
            local_now.timetz().replace(tzinfo=None),
        ),
        timezone.get_current_timezone(),
    )
    previous_active_tables = table_sessions.filter(
        opened_at__lte=previous_snapshot,
    ).filter(
        Q(closed_at__isnull=True) | Q(closed_at__gt=previous_snapshot),
    ).values("table_id").distinct().count()

    active_tables = build_comparison(
        current_active_tables,
        previous_active_tables,
    )
    active_tables["total"] = tables.count()

    return {
        "today_orders": build_comparison(
            today_orders.count(),
            yesterday_orders.count(),
        ),
        "completed_orders": build_comparison(
            today_completed,
            yesterday_completed,
        ),
        "active_tables": active_tables,
        "today_revenue": build_comparison(
            revenue_for(today_orders),
            revenue_for(yesterday_orders),
        ),
    }


def filter_orders(queryset, filters):
    if "restaurant" in filters:
        queryset = queryset.filter(restaurant_id=filters["restaurant"])
    if "date_from" in filters:
        queryset = queryset.filter(created_at__date__gte=filters["date_from"])
    if "date_to" in filters:
        queryset = queryset.filter(created_at__date__lte=filters["date_to"])
    return queryset


def get_statistics_summary(filters, *, include_dashboard_comparison=False):
    orders = filter_orders(Order.objects.all(), filters)
    completed_orders = orders.filter(status=Order.Status.COMPLETED)
    total_orders = orders.count()
    completed_orders_count = completed_orders.count()
    completed_amount = (
        completed_orders.aggregate(total=Sum("total_amount"))["total"]
        or Decimal("0")
    )
    average_order_amount = (
        completed_amount / completed_orders_count
        if completed_orders_count
        else Decimal("0")
    )

    status_counts = {
        status: 0
        for status in Order.Status.values
    }
    status_counts.update(
        {
            row["status"]: row["count"]
            for row in orders.order_by()
            .values("status")
            .annotate(count=Count("id"))
        }
    )

    active_sessions = ActiveTableSession.objects.filter(
        status=ActiveTableSession.Status.ACTIVE,
    )
    if "restaurant" in filters:
        active_sessions = active_sessions.filter(
            restaurant_id=filters["restaurant"]
        )
    if "date_from" in filters:
        active_sessions = active_sessions.filter(
            created_at__date__gte=filters["date_from"]
        )
    if "date_to" in filters:
        active_sessions = active_sessions.filter(
            created_at__date__lte=filters["date_to"]
        )

    money_field = DecimalField(max_digits=14, decimal_places=2)
    completed_items = OrderItem.objects.filter(order__in=completed_orders)
    popular_items = list(
        completed_items.order_by()
        .values("name_ky_at_order", "name_ru_at_order")
        .annotate(
            total_quantity=Sum("quantity"),
            total_amount=Coalesce(
                Sum("total_price"),
                Value(Decimal("0")),
                output_field=money_field,
            ),
        )
        .order_by("-total_quantity", "name_ky_at_order")[:5]
    )
    table_stats = list(
        completed_orders.order_by().values(
            table=F("table_session__table_id"),
            table_number=F("table_session__table__number"),
        )
        .annotate(
            orders_count=Count("id"),
            total_amount=Coalesce(
                Sum("total_amount"),
                Value(Decimal("0")),
                output_field=money_field,
            ),
        )
        .order_by("table_number")
    )
    waiter_stats = list(
        completed_orders.order_by().values(
            waiter=F("responsible_waiter_id"),
            waiter_username=F("responsible_waiter__username"),
        )
        .annotate(
            orders_count=Count("id"),
            total_amount=Coalesce(
                Sum("total_amount"),
                Value(Decimal("0")),
                output_field=money_field,
            ),
        )
        .order_by("waiter_username")
    )

    summary = {
        "total_orders": total_orders,
        "completed_orders": completed_orders_count,
        "completed_amount": completed_amount,
        "average_order_amount": average_order_amount,
        "active_table_sessions": active_sessions.count(),
        "orders_by_status": status_counts,
        "popular_items": popular_items,
        "table_stats": table_stats,
        "waiter_stats": waiter_stats,
    }
    if include_dashboard_comparison:
        summary["dashboard_kpis"] = get_dashboard_kpis(
            filters.get("restaurant"),
        )
    return summary
