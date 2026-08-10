from django.db import models

from apps.common.models import TimeStampedModel
from apps.restaurants.models import Restaurant


class Category(TimeStampedModel):
    restaurant = models.ForeignKey(
        Restaurant,
        on_delete=models.CASCADE,
        related_name="categories",
    )
    name_ky = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255)
    sort_order = models.PositiveIntegerField(default=0)
    is_visible = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        ordering = ("sort_order", "name_ky")

    def __str__(self):
        return self.name_ky


class MenuItem(TimeStampedModel):
    restaurant = models.ForeignKey(
        Restaurant,
        on_delete=models.CASCADE,
        related_name="menu_items",
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="items",
    )
    name_ky = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255)
    description_ky = models.TextField(blank=True)
    description_ru = models.TextField(blank=True)
    image = models.ImageField(
        upload_to="menu/items/",
        blank=True,
        null=True,
    )
    price = models.DecimalField(max_digits=10, decimal_places=2)
    ingredients_ky = models.TextField(blank=True)
    ingredients_ru = models.TextField(blank=True)
    allergens_ky = models.TextField(blank=True)
    allergens_ru = models.TextField(blank=True)
    cooking_time_min = models.PositiveIntegerField(default=0)
    is_available = models.BooleanField(default=True)
    is_visible = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        ordering = ("category", "name_ky")

    def __str__(self):
        return self.name_ky
