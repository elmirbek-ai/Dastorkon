from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import RestaurantAdminViewSet, RestaurantSettingsView


router = DefaultRouter()
router.register(
    "restaurants",
    RestaurantAdminViewSet,
    basename="admin-restaurant",
)

admin_urlpatterns = router.urls + [
    path(
        "restaurants/<int:restaurant_id>/settings/",
        RestaurantSettingsView.as_view(),
        name="admin-restaurant-settings",
    ),
]

urlpatterns = admin_urlpatterns
