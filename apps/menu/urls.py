from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import CategoryAdminViewSet, MenuItemAdminViewSet, PublicMenuView


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

urlpatterns = admin_urlpatterns
