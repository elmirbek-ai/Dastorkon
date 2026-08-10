from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.menu.models import Category, MenuItem
from apps.restaurants.models import Restaurant, RestaurantSettings
from apps.tables.models import RestaurantTable


class Command(BaseCommand):
    help = "Create or update idempotent demo data for Dastorkon."

    @transaction.atomic
    def handle(self, *args, **options):
        self.create_users()

        restaurant, created = Restaurant.objects.update_or_create(
            name="Dastorkon Demo Cafe",
            defaults={
                "address": "Bishkek",
                "phone": "+996700000000",
                "is_active": True,
            },
        )
        RestaurantSettings.objects.update_or_create(
            restaurant=restaurant,
            defaults={
                "comments_enabled": True,
                "default_language": RestaurantSettings.Language.KY,
                "currency": "KGS",
            },
        )

        categories = self.create_categories(restaurant)
        self.create_menu_items(restaurant, categories)
        for number in range(1, 11):
            RestaurantTable.objects.update_or_create(
                restaurant=restaurant,
                number=number,
                defaults={"is_active": True},
            )

        category_count = restaurant.categories.count()
        menu_item_count = restaurant.menu_items.count()
        table_count = restaurant.tables.count()
        table_one = restaurant.tables.get(number=1)
        restaurant_action = "created" if created else "updated"

        self.stdout.write(
            self.style.SUCCESS(
                "Demo data seeded successfully.\n"
                f"Restaurant {restaurant_action}: {restaurant.name}\n"
                "Demo users:\n"
                "  admin / admin12345\n"
                "  waiter / waiter12345\n"
                "  kitchen / kitchen12345\n"
                f"Categories: {category_count}\n"
                f"Menu items: {menu_item_count}\n"
                f"Tables: {table_count}\n"
                f"Table 1 QR URL: /menu/{table_one.qr_token}/"
            )
        )

    def create_users(self):
        user_model = get_user_model()
        users = (
            ("admin", "admin12345", user_model.Role.ADMIN, True, True),
            ("waiter", "waiter12345", user_model.Role.WAITER, False, False),
            ("kitchen", "kitchen12345", user_model.Role.KITCHEN, False, False),
        )
        for username, password, role, is_staff, is_superuser in users:
            user, _ = user_model.objects.get_or_create(username=username)
            user.role = role
            user.is_active = True
            user.is_staff = is_staff
            user.is_superuser = is_superuser
            user.set_password(password)
            user.save(
                update_fields=(
                    "role",
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "password",
                )
            )

    def create_categories(self, restaurant):
        category_data = (
            ("Салаттар", "Салаты"),
            ("Биринчи тамактар", "Первые блюда"),
            ("Экинчи тамактар", "Вторые блюда"),
            ("Суусундуктар", "Напитки"),
        )
        categories = {}
        for sort_order, (name_ky, name_ru) in enumerate(category_data, start=1):
            category, _ = Category.objects.update_or_create(
                restaurant=restaurant,
                name_ky=name_ky,
                defaults={
                    "name_ru": name_ru,
                    "sort_order": sort_order,
                    "is_visible": True,
                    "is_deleted": False,
                },
            )
            categories[name_ky] = category
        return categories

    def create_menu_items(self, restaurant, categories):
        menu_items = (
            (
                "Цезарь салаты",
                "Салат Цезарь",
                "Салаттар",
                Decimal("280.00"),
            ),
            (
                "Шорпо",
                "Шорпо",
                "Биринчи тамактар",
                Decimal("250.00"),
            ),
            (
                "Лагман",
                "Лагман",
                "Экинчи тамактар",
                Decimal("300.00"),
            ),
            (
                "Плов",
                "Плов",
                "Экинчи тамактар",
                Decimal("350.00"),
            ),
            ("Чай", "Чай", "Суусундуктар", Decimal("80.00")),
            ("Кола", "Кола", "Суусундуктар", Decimal("120.00")),
        )
        for name_ky, name_ru, category_name, price in menu_items:
            MenuItem.objects.update_or_create(
                restaurant=restaurant,
                name_ky=name_ky,
                defaults={
                    "category": categories[category_name],
                    "name_ru": name_ru,
                    "price": price,
                    "is_available": True,
                    "is_visible": True,
                    "is_deleted": False,
                },
            )
