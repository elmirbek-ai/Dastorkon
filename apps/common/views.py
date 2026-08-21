import logging

from django.conf import settings
from django.db import DatabaseError, connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET


logger = logging.getLogger(__name__)


def redis_is_available():
    from redis import Redis

    client = Redis.from_url(
        settings.REDIS_URL,
        socket_connect_timeout=1,
        socket_timeout=1,
    )
    try:
        return bool(client.ping())
    finally:
        client.close()


@require_GET
def health(request):
    return JsonResponse({'status': 'ok'})


@require_GET
def readiness(request):
    dependencies = {}
    is_ready = True

    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
        dependencies['database'] = 'ok'
    except DatabaseError:
        logger.warning('Readiness database check failed.')
        dependencies['database'] = 'error'
        is_ready = False

    if settings.REDIS_URL:
        try:
            redis_ready = redis_is_available()
        except Exception:
            redis_ready = False

        if redis_ready:
            dependencies['redis'] = 'ok'
        else:
            logger.warning('Readiness Redis check failed.')
            dependencies['redis'] = 'error'
            is_ready = False

    payload = {
        'status': 'ready' if is_ready else 'unavailable',
        **dependencies,
    }
    return JsonResponse(payload, status=200 if is_ready else 503)
