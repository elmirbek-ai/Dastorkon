from rest_framework.routers import DefaultRouter

from .views import RestaurantTableAdminViewSet


router = DefaultRouter()
router.register("tables", RestaurantTableAdminViewSet, basename="admin-table")

urlpatterns = router.urls
