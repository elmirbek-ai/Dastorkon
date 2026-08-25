from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import (
    CategoryAdminViewSet,
    MenuItemAdminViewSet,
    PublicMenuView,
    WaiterMenuItemAvailabilityView,
    WaiterMenuItemListView,
)


router = DefaultRouter()
router.register("categories", CategoryAdminViewSet, basename="admin-category")
router.register("menu-items", MenuItemAdminViewSet, basename="admin-menu-item")

admin_urlpatterns = router.urls
public_urlpatterns = [
    path(
        "qr/<uuid:qr_token>/menu/",
        PublicMenuView.as_view(),
        name="public-menu",
    ),
]

waiter_urlpatterns = [
    path(
        "menu-items/",
        WaiterMenuItemListView.as_view(),
        name="waiter-menu-item-list",
    ),
    path(
        "menu-items/<int:item_id>/availability/",
        WaiterMenuItemAvailabilityView.as_view(),
        name="waiter-menu-item-availability",
    ),
]

urlpatterns = admin_urlpatterns
