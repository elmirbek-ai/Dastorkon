from django.db.models import Prefetch

from .models import MenuItemModifierGroup, MenuItemModifierOption


def active_modifier_groups_prefetch():
    available_options = MenuItemModifierOption.objects.filter(
        is_active=True,
        is_available=True,
    ).order_by("sort_order", "name_ky", "id")
    active_groups = (
        MenuItemModifierGroup.objects.filter(is_active=True)
        .order_by("sort_order", "name_ky", "id")
        .prefetch_related(
            Prefetch(
                "options",
                queryset=available_options,
                to_attr="public_options",
            )
        )
    )
    return Prefetch(
        "modifier_groups",
        queryset=active_groups,
        to_attr="public_modifier_groups",
    )
