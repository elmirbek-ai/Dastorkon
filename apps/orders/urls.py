from django.urls import path

from .views import (
    AcceptTableSessionView,
    AvailableTableSessionsView,
    CloseTableSessionView,
    MarkOrderDeliveredView,
    MyOrdersView,
    MyTableSessionsView,
    PublicCartItemCreateView,
    PublicCartItemDetailView,
    PublicCartView,
    PublicOrderView,
)


public_urlpatterns = [
    path(
        "qr/<uuid:qr_token>/cart/",
        PublicCartView.as_view(),
        name="public-cart",
    ),
    path(
        "qr/<uuid:qr_token>/cart/items/",
        PublicCartItemCreateView.as_view(),
        name="public-cart-item-create",
    ),
    path(
        "qr/<uuid:qr_token>/cart/items/<int:item_id>/",
        PublicCartItemDetailView.as_view(),
        name="public-cart-item-detail",
    ),
    path(
        "qr/<uuid:qr_token>/orders/",
        PublicOrderView.as_view(),
        name="public-orders",
    ),
]

waiter_urlpatterns = [
    path(
        "table-sessions/available/",
        AvailableTableSessionsView.as_view(),
        name="waiter-table-sessions-available",
    ),
    path(
        "table-sessions/my/",
        MyTableSessionsView.as_view(),
        name="waiter-table-sessions-my",
    ),
    path(
        "table-sessions/<int:session_id>/accept/",
        AcceptTableSessionView.as_view(),
        name="waiter-table-session-accept",
    ),
    path(
        "table-sessions/<int:session_id>/close/",
        CloseTableSessionView.as_view(),
        name="waiter-table-session-close",
    ),
    path(
        "orders/",
        MyOrdersView.as_view(),
        name="waiter-orders",
    ),
    path(
        "orders/<int:order_id>/delivered/",
        MarkOrderDeliveredView.as_view(),
        name="waiter-order-delivered",
    ),
]

urlpatterns = public_urlpatterns
