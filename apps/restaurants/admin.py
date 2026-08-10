from django.contrib import admin

from .models import Restaurant, RestaurantSettings


admin.site.register(Restaurant)
admin.site.register(RestaurantSettings)
