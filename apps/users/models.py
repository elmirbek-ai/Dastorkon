from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        WAITER = "WAITER", "Waiter"
        KITCHEN = "KITCHEN", "Kitchen"

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.WAITER,
    )
    phone = models.CharField(max_length=20, blank=True)
    avatar = models.ImageField(
        upload_to="users/avatars/",
        blank=True,
        null=True,
    )


class WaiterShift(models.Model):
    waiter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shifts",
    )
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("-started_at",)
        constraints = (
            models.UniqueConstraint(
                fields=("waiter",),
                condition=Q(is_active=True),
                name="unique_active_shift_per_waiter",
            ),
        )

    def __str__(self):
        return f"{self.waiter} shift"
