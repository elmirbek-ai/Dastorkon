from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User, WaiterShift


@admin.register(User)
class DastorkonUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        (
            "Dastorkon",
            {"fields": ("role", "primary_phone", "secondary_phone", "avatar")},
        ),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        (
            "Dastorkon",
            {"fields": ("role", "primary_phone", "secondary_phone", "avatar")},
        ),
    )


@admin.register(WaiterShift)
class WaiterShiftAdmin(admin.ModelAdmin):
    list_display = ("waiter", "started_at", "ended_at", "is_active")
    list_filter = ("is_active",)
