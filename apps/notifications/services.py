from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def send_notification_to_group(group_name, event, data):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        group_name,
        {
            "type": "notification.message",
            "event": event,
            "data": data,
        },
    )


def send_notification_to_user(user_id, event, data):
    send_notification_to_group(f"user_{user_id}", event, data)


def notify_kitchen(event, data):
    send_notification_to_group("kitchen", event, data)


def notify_waiters(event, data):
    send_notification_to_group("waiters", event, data)


def notify_admins(event, data):
    send_notification_to_group("admins", event, data)


def build_order_notification_payload(order):
    return {
        "id": order.pk,
        "order_number": order.order_number,
        "table_session": order.table_session_id,
        "table_number": order.table_session.table.number,
        "source": order.source,
        "status": order.status,
        "total_amount": str(order.total_amount),
        "created_at": order.created_at.isoformat(),
        "items_count": order.items.count(),
    }


def build_waiter_call_notification_payload(waiter_call):
    return {
        "id": waiter_call.pk,
        "reason": waiter_call.reason,
        "status": waiter_call.status,
        "table_session": waiter_call.table_session_id,
        "table_number": waiter_call.table_session.table.number,
        "assigned_waiter": waiter_call.assigned_waiter_id,
        "created_at": waiter_call.created_at.isoformat(),
    }


def build_table_session_notification_payload(table_session):
    return {
        "id": table_session.pk,
        "table": table_session.table_id,
        "table_number": table_session.table.number,
        "assigned_waiter": table_session.assigned_waiter_id,
        "status": table_session.status,
        "opened_at": table_session.opened_at.isoformat(),
        "closed_at": (
            table_session.closed_at.isoformat()
            if table_session.closed_at
            else None
        ),
    }
