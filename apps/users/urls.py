from django.urls import path

from .views import (
    CurrentWaiterShiftView,
    WaiterShiftEndView,
    WaiterShiftStartView,
)


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
