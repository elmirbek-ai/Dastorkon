from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import (
    CategoryAdminViewSet,
    MenuItemAdminViewSet,
    MenuItemModifierGroupDetailView,
    MenuItemModifierGroupListCreateView,
    MenuItemModifierOptionDetailView,
    MenuItemModifierOptionListCreateView,
    PublicMenuView,
    WaiterMenuItemAvailabilityView,
    WaiterMenuItemListView,
)


router = DefaultRouter()
router.register("categories", CategoryAdminViewSet, basename="admin-category")
router.register("menu-items", MenuItemAdminViewSet, basename="admin-menu-item")

admin_urlpatterns = [
    path(
        "menu-items/<int:item_id>/modifier-groups/",
        MenuItemModifierGroupListCreateView.as_view(),
        name="admin-menu-item-modifier-group-list",
    ),
    path(
        "modifier-groups/<int:group_id>/",
        MenuItemModifierGroupDetailView.as_view(),
        name="admin-modifier-group-detail",
    ),
    path(
        "modifier-groups/<int:group_id>/options/",
        MenuItemModifierOptionListCreateView.as_view(),
        name="admin-modifier-group-option-list",
    ),
    path(
        "modifier-options/<int:option_id>/",
        MenuItemModifierOptionDetailView.as_view(),
        name="admin-modifier-option-detail",
    ),
] + router.urls
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
