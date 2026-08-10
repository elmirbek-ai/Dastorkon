from django.contrib.auth.models import AbstractUser
from django.db import models


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
