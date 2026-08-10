from django.db import models

from apps.common.models import TimeStampedModel


class Restaurant(TimeStampedModel):
    name = models.CharField(max_length=255)
    logo = models.ImageField(
        upload_to="restaurants/logos/",
        blank=True,
        null=True,
    )
    address = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class RestaurantSettings(TimeStampedModel):
    class Language(models.TextChoices):
        KY = "KY", "Kyrgyz"
        RU = "RU", "Russian"

    restaurant = models.OneToOneField(
        Restaurant,
        on_delete=models.CASCADE,
        related_name="settings",
    )
    comments_enabled = models.BooleanField(default=True)
    default_language = models.CharField(
        max_length=2,
        choices=Language.choices,
        default=Language.KY,
    )
    currency = models.CharField(max_length=10, default="KGS")

    def __str__(self):
        return f"{self.restaurant} settings"
