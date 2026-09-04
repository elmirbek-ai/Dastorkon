from datetime import UTC, date, datetime

from django.conf import settings
from django.test import SimpleTestCase

from apps.common.business_time import get_business_timezone, get_local_day_range


class BusinessTimeTests(SimpleTestCase):
    def test_business_timezone_defaults_to_bishkek_strategy(self):
        self.assertEqual(settings.TIME_ZONE, "Asia/Bishkek")
        self.assertEqual(settings.BUSINESS_TIME_ZONE, "Asia/Bishkek")
        self.assertEqual(get_business_timezone().key, "Asia/Bishkek")

    def test_local_day_range_returns_aware_exclusive_boundaries(self):
        start, end = get_local_day_range(date(2026, 1, 10))

        self.assertEqual(
            start.astimezone(UTC),
            datetime(2026, 1, 9, 18, 0, tzinfo=UTC),
        )
        self.assertEqual(
            end.astimezone(UTC),
            datetime(2026, 1, 10, 18, 0, tzinfo=UTC),
        )
