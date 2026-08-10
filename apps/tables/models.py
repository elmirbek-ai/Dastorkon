import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.common.models import TimeStampedModel
from apps.restaurants.models import Restaurant


class RestaurantTable(TimeStampedModel):
    class Status(models.TextChoices):
        FREE = "FREE", "Free"
        OCCUPIED = "OCCUPIED", "Occupied"

    restaurant = models.ForeignKey(
        Restaurant,
        on_delete=models.CASCADE,
        related_name="tables",
    )
    number = models.PositiveIntegerField()
    qr_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.FREE,
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("restaurant", "number")
        constraints = (
            models.UniqueConstraint(
                fields=("restaurant", "number"),
                name="unique_table_number_per_restaurant",
            ),
        )

    def __str__(self):
        return f"{self.restaurant} - Table {self.number}"


class ActiveTableSession(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        CLOSED = "CLOSED", "Closed"

    restaurant = models.ForeignKey(
        Restaurant,
        on_delete=models.CASCADE,
        related_name="table_sessions",
    )
    table = models.ForeignKey(
        RestaurantTable,
        on_delete=models.PROTECT,
        related_name="sessions",
    )
    assigned_waiter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_table_sessions",
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-opened_at",)
        constraints = (
            models.UniqueConstraint(
                fields=("table",),
                condition=Q(status="ACTIVE"),
                name="unique_active_session_per_table",
            ),
        )

    def __str__(self):
        return f"{self.table} session"


class CustomerSession(TimeStampedModel):
    active_table_session = models.ForeignKey(
        ActiveTableSession,
        on_delete=models.CASCADE,
        related_name="customer_sessions",
    )
    session_key = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    is_active = models.BooleanField(default=True)
    last_activity = models.DateTimeField(auto_now=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"Customer session {self.session_key}"
