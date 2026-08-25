from django.contrib import admin

from .models import (
    Category,
    MenuItem,
    MenuItemModifierGroup,
    MenuItemModifierOption,
)


class MenuItemModifierGroupInline(admin.TabularInline):
    model = MenuItemModifierGroup
    extra = 0


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
    inlines = (MenuItemModifierGroupInline,)


class MenuItemModifierOptionInline(admin.TabularInline):
    model = MenuItemModifierOption
    extra = 0


@admin.register(MenuItemModifierGroup)
class MenuItemModifierGroupAdmin(admin.ModelAdmin):
    list_display = (
        "name_ky",
        "name_ru",
        "menu_item",
        "selection_type",
        "is_required",
        "is_active",
        "sort_order",
    )
    list_filter = ("selection_type", "is_required", "is_active")
    inlines = (MenuItemModifierOptionInline,)


@admin.register(MenuItemModifierOption)
class MenuItemModifierOptionAdmin(admin.ModelAdmin):
    list_display = (
        "name_ky",
        "name_ru",
        "group",
        "price_delta",
        "is_available",
        "is_active",
        "sort_order",
    )
    list_filter = ("is_available", "is_active")
