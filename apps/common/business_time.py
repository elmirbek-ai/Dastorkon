from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone


DEFAULT_BUSINESS_TIME_ZONE = "Asia/Bishkek"


def get_business_timezone():
    return ZoneInfo(
        getattr(
            settings,
            "BUSINESS_TIME_ZONE",
            DEFAULT_BUSINESS_TIME_ZONE,
        )
    )


def get_local_day_range(day):
    business_timezone = get_business_timezone()
    start = timezone.make_aware(
        datetime.combine(day, time.min),
        business_timezone,
    )
    end = timezone.make_aware(
        datetime.combine(day + timedelta(days=1), time.min),
        business_timezone,
    )
    return start, end
