from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.menu.models import (
    MenuItem,
    MenuItemModifierGroup,
    MenuItemModifierOption,
)
from apps.restaurants.models import Restaurant
from apps.tables.models import ActiveTableSession, CustomerSession


ITEM_COMMENT_MAX_LENGTH = 300


class Order(TimeStampedModel):
    class Source(models.TextChoices):
        CUSTOMER_QR = "CUSTOMER_QR", "Customer QR"
        WAITER_MANUAL = "WAITER_MANUAL", "Waiter manual"

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        PREPARING = "PREPARING", "Preparing"
        READY = "READY", "Ready"
        DELIVERED = "DELIVERED", "Delivered"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    restaurant = models.ForeignKey(
        Restaurant,
        on_delete=models.CASCADE,
        related_name="orders",
    )
    table_session = models.ForeignKey(
        ActiveTableSession,
        on_delete=models.PROTECT,
        related_name="orders",
    )
    customer_session = models.ForeignKey(
        CustomerSession,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="orders",
    )
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.CUSTOMER_QR,
    )
    order_number = models.CharField(max_length=30, unique=True)
    responsible_waiter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
    )
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.order_number


class OrderItem(models.Model):
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="items",
    )
    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_items",
    )
    name_ky_at_order = models.CharField(max_length=255)
    name_ru_at_order = models.CharField(max_length=255)
    price_at_order = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()
    comment = models.TextField(blank=True)
    total_price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        ordering = ("id",)

    def __str__(self):
        return f"{self.name_ky_at_order} x{self.quantity}"


class OrderItemModifierSnapshot(models.Model):
    order_item = models.ForeignKey(
        OrderItem,
        on_delete=models.CASCADE,
        related_name="modifiers",
    )
    group_name_ky = models.CharField(max_length=255)
    group_name_ru = models.CharField(max_length=255)
    option_name_ky = models.CharField(max_length=255)
    option_name_ru = models.CharField(max_length=255)
    price_delta = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    group_sort_order = models.PositiveIntegerField(default=0)
    option_sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("group_sort_order", "option_sort_order", "id")

    def __str__(self):
        return f"{self.group_name_ky}: {self.option_name_ky}"


class CartItem(TimeStampedModel):
    customer_session = models.ForeignKey(
        CustomerSession,
        on_delete=models.CASCADE,
        related_name="cart_items",
    )
    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        related_name="cart_items",
    )
    quantity = models.PositiveIntegerField()
    comment = models.TextField(blank=True)

    def __str__(self):
        return f"{self.menu_item} x{self.quantity}"


class CartItemModifierSelection(models.Model):
    cart_item = models.ForeignKey(
        CartItem,
        on_delete=models.CASCADE,
        related_name="modifier_selections",
    )
    group = models.ForeignKey(
        MenuItemModifierGroup,
        on_delete=models.CASCADE,
        related_name="cart_selections",
    )
    option = models.ForeignKey(
        MenuItemModifierOption,
        on_delete=models.CASCADE,
        related_name="cart_selections",
    )

    class Meta:
        ordering = (
            "group__sort_order",
            "option__sort_order",
            "id",
        )
        constraints = (
            models.UniqueConstraint(
                fields=("cart_item", "option"),
                name="unique_cart_item_modifier_option",
            ),
        )

    def __str__(self):
        return f"{self.cart_item}: {self.option}"


class OrderStatusHistory(TimeStampedModel):
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name="status_history",
    )
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_status_changes",
    )

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.order}: {self.from_status or '-'} to {self.to_status}"


class WaiterCall(TimeStampedModel):
    class Reason(models.TextChoices):
        WAITER_NEEDED = "WAITER_NEEDED", "Waiter needed"
        BILL_REQUEST = "BILL_REQUEST", "Bill request"
        EXTRA_ORDER = "EXTRA_ORDER", "Extra order"
        HELP_NEEDED = "HELP_NEEDED", "Help needed"

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        ACCEPTED = "ACCEPTED", "Accepted"
        DONE = "DONE", "Done"

    restaurant = models.ForeignKey(
        Restaurant,
        on_delete=models.CASCADE,
        related_name="waiter_calls",
    )
    table_session = models.ForeignKey(
        ActiveTableSession,
        on_delete=models.CASCADE,
        related_name="waiter_calls",
    )
    customer_session = models.ForeignKey(
        CustomerSession,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="waiter_calls",
    )
    assigned_waiter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="waiter_calls",
    )
    reason = models.CharField(max_length=20, choices=Reason.choices)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
    )
    accepted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.get_reason_display()} - {self.table_session}"
