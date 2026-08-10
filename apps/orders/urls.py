from django.urls import path

from .views import (
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

urlpatterns = public_urlpatterns
