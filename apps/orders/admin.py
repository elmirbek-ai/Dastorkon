from django.contrib import admin

from .models import (
    CartItem,
    CartItemModifierSelection,
    Order,
    OrderItem,
    OrderItemModifierSnapshot,
    OrderStatusHistory,
    WaiterCall,
)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "order_number",
        "restaurant",
        "table_session",
        "source",
        "responsible_waiter",
        "status",
        "total_amount",
        "created_at",
    )
    list_filter = ("restaurant", "source", "status")


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = (
        "order",
        "name_ky_at_order",
        "menu_item",
        "quantity",
        "price_at_order",
        "total_price",
    )
    list_filter = ("order__restaurant",)


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = (
        "customer_session",
        "menu_item",
        "quantity",
        "comment",
        "updated_at",
    )
    list_filter = ("menu_item__restaurant",)


@admin.register(CartItemModifierSelection)
class CartItemModifierSelectionAdmin(admin.ModelAdmin):
    list_display = ("cart_item", "group", "option")
    list_filter = ("cart_item__menu_item__restaurant",)


@admin.register(OrderItemModifierSnapshot)
class OrderItemModifierSnapshotAdmin(admin.ModelAdmin):
    list_display = (
        "order_item",
        "group_name_ky",
        "option_name_ky",
        "price_delta",
    )
    list_filter = ("order_item__order__restaurant",)


@admin.register(OrderStatusHistory)
class OrderStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ("order", "from_status", "to_status", "changed_by", "created_at")
    list_filter = ("from_status", "to_status")


@admin.register(WaiterCall)
class WaiterCallAdmin(admin.ModelAdmin):
    list_display = (
        "table_session",
        "restaurant",
        "reason",
        "status",
        "assigned_waiter",
        "created_at",
    )
    list_filter = ("restaurant", "reason", "status")
