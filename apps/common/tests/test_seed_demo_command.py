from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from apps.menu.models import Category, MenuItem
from apps.restaurants.models import Restaurant, RestaurantSettings
from apps.tables.models import RestaurantTable


User = get_user_model()


class SeedDemoCommandTests(TestCase):
    def run_command(self):
        output = StringIO()
        call_command("seed_demo", stdout=output)
        return output.getvalue()

    def test_command_creates_demo_users(self):
        output = self.run_command()

        for username, password, role, is_staff, is_superuser in (
            ("admin", "admin12345", User.Role.ADMIN, True, True),
            ("waiter", "waiter12345", User.Role.WAITER, False, False),
            ("kitchen", "kitchen12345", User.Role.KITCHEN, False, False),
        ):
            user = User.objects.get(username=username)
            self.assertEqual(user.role, role)
            self.assertEqual(user.is_staff, is_staff)
            self.assertEqual(user.is_superuser, is_superuser)
            self.assertTrue(user.check_password(password))
            self.assertIn(f"{username} / {password}", output)

    def test_command_creates_restaurant_and_settings(self):
        self.run_command()

        restaurant = Restaurant.objects.get(name="Dastorkon Demo Cafe")
        self.assertEqual(restaurant.address, "Bishkek")
        self.assertEqual(restaurant.phone, "+996700000000")
        self.assertTrue(restaurant.is_active)
        settings = RestaurantSettings.objects.get(restaurant=restaurant)
        self.assertTrue(settings.comments_enabled)
        self.assertEqual(settings.default_language, RestaurantSettings.Language.KY)
        self.assertEqual(settings.currency, "KGS")

    def test_command_creates_categories_menu_items_and_tables(self):
        output = self.run_command()
        restaurant = Restaurant.objects.get(name="Dastorkon Demo Cafe")

        self.assertEqual(Category.objects.filter(restaurant=restaurant).count(), 4)
        self.assertEqual(MenuItem.objects.filter(restaurant=restaurant).count(), 6)
        self.assertEqual(
            RestaurantTable.objects.filter(restaurant=restaurant).count(),
            10,
        )
        plov = restaurant.menu_items.get(name_ky="Плов")
        self.assertEqual(plov.category.name_ky, "Экинчи тамактар")
        self.assertTrue(plov.is_available)
        self.assertTrue(plov.is_visible)
        self.assertFalse(plov.is_deleted)
        self.assertEqual(
            set(restaurant.tables.values_list("number", flat=True)),
            set(range(1, 11)),
        )
        self.assertIn(
            f"/menu/{restaurant.tables.get(number=1).qr_token}/",
            output,
        )

    def test_command_is_idempotent(self):
        self.run_command()
        restaurant = Restaurant.objects.get(name="Dastorkon Demo Cafe")
        first_qr_token = restaurant.tables.get(number=1).qr_token

        self.run_command()

        self.assertEqual(
            User.objects.filter(
                username__in=("admin", "waiter", "kitchen")
            ).count(),
            3,
        )
        self.assertEqual(Restaurant.objects.filter(name=restaurant.name).count(), 1)
        self.assertEqual(restaurant.categories.count(), 4)
        self.assertEqual(restaurant.menu_items.count(), 6)
        self.assertEqual(restaurant.tables.count(), 10)
        self.assertEqual(restaurant.tables.get(number=1).qr_token, first_qr_token)
