from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.menu.models import MenuItem
from apps.restaurants.models import Restaurant
from apps.tables.models import ActiveTableSession, CustomerSession


class Order(TimeStampedModel):
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
        related_name="orders",
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
