from django.contrib import admin

from .models import ActiveTableSession, CustomerSession, RestaurantTable


@admin.register(RestaurantTable)
class RestaurantTableAdmin(admin.ModelAdmin):
    list_display = ("number", "restaurant", "status", "is_active")
    list_filter = ("restaurant", "status", "is_active")


@admin.register(ActiveTableSession)
class ActiveTableSessionAdmin(admin.ModelAdmin):
    list_display = (
        "table",
        "restaurant",
        "assigned_waiter",
        "status",
        "opened_at",
        "closed_at",
    )
    list_filter = ("restaurant", "status")


@admin.register(CustomerSession)
class CustomerSessionAdmin(admin.ModelAdmin):
    list_display = (
        "session_key",
        "active_table_session",
        "is_active",
        "last_activity",
        "closed_at",
    )
    list_filter = ("is_active",)
