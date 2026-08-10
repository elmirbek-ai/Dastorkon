"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.menu import urls as menu_urls
from apps.orders import urls as order_urls
from apps.tables import urls as table_urls

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path(
        'api/auth/token/refresh/',
        TokenRefreshView.as_view(),
        name='token_refresh',
    ),
    path('common/', include('apps.common.urls')),
    path('users/', include('apps.users.urls')),
    path('restaurants/', include('apps.restaurants.urls')),
    path('api/admin/', include(menu_urls.admin_urlpatterns)),
    path('api/admin/', include(table_urls.admin_urlpatterns)),
    path('api/public/', include(menu_urls.public_urlpatterns)),
    path('api/public/', include(table_urls.public_urlpatterns)),
    path('api/public/', include(order_urls.public_urlpatterns)),
    path('notifications/', include('apps.notifications.urls')),
    path('analytics/', include('apps.analytics.urls')),
]
