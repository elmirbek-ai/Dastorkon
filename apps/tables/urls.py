from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import CustomerSessionStartView, RestaurantTableAdminViewSet


router = DefaultRouter()
router.register("tables", RestaurantTableAdminViewSet, basename="admin-table")

admin_urlpatterns = router.urls
public_urlpatterns = [
    path(
        "qr/<uuid:qr_token>/session/",
        CustomerSessionStartView.as_view(),
        name="public-customer-session",
    ),
]

urlpatterns = admin_urlpatterns
