from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminUserViewSet,
    CurrentUserView,
    CurrentWaiterShiftView,
    WaiterShiftEndView,
    WaiterShiftStartView,
)

admin_router = DefaultRouter()
admin_router.register("users", AdminUserViewSet, basename="admin-user")

admin_urlpatterns = admin_router.urls

auth_urlpatterns = [
    path("me/", CurrentUserView.as_view(), name="current-user"),
]


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
