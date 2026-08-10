from rest_framework.routers import DefaultRouter

from .views import CategoryAdminViewSet, MenuItemAdminViewSet


router = DefaultRouter()
router.register("categories", CategoryAdminViewSet, basename="admin-category")
router.register("menu-items", MenuItemAdminViewSet, basename="admin-menu-item")

urlpatterns = router.urls
