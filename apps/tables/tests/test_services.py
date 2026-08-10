from django.test import TestCase

from apps.restaurants.models import Restaurant
from apps.tables.models import ActiveTableSession, RestaurantTable
from apps.tables.services import (
    close_active_table_session,
    create_customer_session,
    get_or_create_active_table_session,
)


class TableServicesTests(TestCase):
    def setUp(self):
        self.restaurant = Restaurant.objects.create(name="Dastorkon")
        self.table = RestaurantTable.objects.create(
            restaurant=self.restaurant,
            number=1,
        )

    def test_get_or_create_active_table_session_creates_session(self):
        table_session = get_or_create_active_table_session(self.table)

        self.table.refresh_from_db()
        self.assertEqual(table_session.table, self.table)
        self.assertEqual(table_session.status, ActiveTableSession.Status.ACTIVE)
        self.assertEqual(self.table.status, RestaurantTable.Status.OCCUPIED)

    def test_get_or_create_active_table_session_returns_existing_session(self):
        first_session = get_or_create_active_table_session(self.table)
        second_session = get_or_create_active_table_session(self.table)

        self.assertEqual(second_session, first_session)
        self.assertEqual(ActiveTableSession.objects.count(), 1)

    def test_create_customer_session_creates_active_session(self):
        table_session = get_or_create_active_table_session(self.table)

        customer_session = create_customer_session(table_session)

        self.assertEqual(customer_session.active_table_session, table_session)
        self.assertTrue(customer_session.is_active)
        self.assertIsNone(customer_session.closed_at)

    def test_close_active_table_session_closes_related_sessions_and_table(self):
        table_session = get_or_create_active_table_session(self.table)
        first_customer = create_customer_session(table_session)
        second_customer = create_customer_session(table_session)

        close_active_table_session(table_session)

        table_session.refresh_from_db()
        first_customer.refresh_from_db()
        second_customer.refresh_from_db()
        self.table.refresh_from_db()
        self.assertEqual(table_session.status, ActiveTableSession.Status.CLOSED)
        self.assertIsNotNone(table_session.closed_at)
        self.assertFalse(first_customer.is_active)
        self.assertFalse(second_customer.is_active)
        self.assertIsNotNone(first_customer.closed_at)
        self.assertIsNotNone(second_customer.closed_at)
        self.assertEqual(self.table.status, RestaurantTable.Status.FREE)
