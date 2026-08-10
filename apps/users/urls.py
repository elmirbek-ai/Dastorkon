from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminUserViewSet,
    CurrentWaiterShiftView,
    WaiterShiftEndView,
    WaiterShiftStartView,
)

admin_router = DefaultRouter()
admin_router.register("users", AdminUserViewSet, basename="admin-user")

admin_urlpatterns = admin_router.urls


waiter_urlpatterns = [
    path(
        "shifts/start/",
        WaiterShiftStartView.as_view(),
        name="waiter-shift-start",
    ),
    path(
        "shifts/end/",
        WaiterShiftEndView.as_view(),
        name="waiter-shift-end",
    ),
    path(
        "shifts/current/",
        CurrentWaiterShiftView.as_view(),
        name="waiter-shift-current",
    ),
]

urlpatterns = waiter_urlpatterns
