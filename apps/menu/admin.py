from django.contrib import admin

from .models import Category, MenuItem


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = (
        "name_ky",
        "name_ru",
        "restaurant",
        "is_visible",
        "is_deleted",
        "sort_order",
    )
    list_filter = ("restaurant", "is_visible", "is_deleted")


@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = (
        "name_ky",
        "category",
        "price",
        "is_available",
        "is_visible",
        "is_deleted",
    )
    list_filter = (
        "restaurant",
        "category",
        "is_available",
        "is_visible",
        "is_deleted",
    )
