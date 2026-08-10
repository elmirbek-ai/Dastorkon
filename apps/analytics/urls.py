from django.urls import path

from .views import StatisticsSummaryView


admin_urlpatterns = [
    path(
        "statistics/summary/",
        StatisticsSummaryView.as_view(),
        name="admin-statistics-summary",
    ),
]

urlpatterns = admin_urlpatterns
