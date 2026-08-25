from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
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
    cooking_time_min = models.PositiveIntegerField(
        blank=True,
        null=True,
        validators=(MinValueValidator(1), MaxValueValidator(300)),
    )
    is_hit = models.BooleanField(default=False)
    is_new = models.BooleanField(default=False)
    is_spicy = models.BooleanField(default=False)
    is_vegetarian = models.BooleanField(default=False)
    is_recommended = models.BooleanField(default=False)
    is_available = models.BooleanField(default=True)
    is_visible = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        ordering = ("category", "name_ky")

    def __str__(self):
        return self.name_ky


class MenuItemModifierGroup(TimeStampedModel):
    class SelectionType(models.TextChoices):
        SINGLE = "SINGLE", "Single"
        MULTIPLE = "MULTIPLE", "Multiple"

    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        related_name="modifier_groups",
    )
    name_ky = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255)
    selection_type = models.CharField(
        max_length=8,
        choices=SelectionType.choices,
    )
    is_required = models.BooleanField(default=False)
    min_selected = models.PositiveIntegerField(default=0)
    max_selected = models.PositiveIntegerField(blank=True, null=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "name_ky", "id")

    @property
    def effective_max_selected(self):
        if self.selection_type == self.SelectionType.SINGLE:
            return 1
        return self.max_selected

    def clean(self):
        super().clean()
        errors = {}
        if (
            self.max_selected is not None
            and self.max_selected < self.min_selected
        ):
            errors["max_selected"] = (
                "Maximum selections cannot be less than minimum selections."
            )
        if self.selection_type == self.SelectionType.SINGLE:
            if self.min_selected > 1:
                errors["min_selected"] = (
                    "Single-selection groups cannot require more than one selection."
                )
            if self.max_selected not in (None, 1):
                errors["max_selected"] = (
                    "Single-selection groups must have a maximum of one selection."
                )
        if self.is_required and self.min_selected < 1:
            errors["min_selected"] = (
                "Required groups must require at least one selection."
            )
        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.menu_item}: {self.name_ky}"


class MenuItemModifierOption(TimeStampedModel):
    group = models.ForeignKey(
        MenuItemModifierGroup,
        on_delete=models.CASCADE,
        related_name="options",
    )
    name_ky = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255)
    price_delta = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    sort_order = models.PositiveIntegerField(default=0)
    is_available = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("sort_order", "name_ky", "id")

    def __str__(self):
        return f"{self.group}: {self.name_ky}"
