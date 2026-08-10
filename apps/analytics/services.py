from decimal import Decimal

from django.db.models import Count, DecimalField, F, Sum, Value
from django.db.models.functions import Coalesce

from apps.orders.models import Order, OrderItem
from apps.tables.models import ActiveTableSession


def filter_orders(queryset, filters):
    if "restaurant" in filters:
        queryset = queryset.filter(restaurant_id=filters["restaurant"])
    if "date_from" in filters:
        queryset = queryset.filter(created_at__date__gte=filters["date_from"])
    if "date_to" in filters:
        queryset = queryset.filter(created_at__date__lte=filters["date_to"])
    return queryset


def get_statistics_summary(filters):
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

    return {
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
