from unittest.mock import patch

from django.db import DatabaseError
from django.test import TestCase, override_settings
from django.urls import reverse


@override_settings(REDIS_URL=None)
class HealthEndpointTests(TestCase):
    def test_liveness_returns_minimal_public_response(self):
        response = self.client.get(reverse('health'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    def test_readiness_checks_available_database(self):
        response = self.client.get(reverse('readiness'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {'status': 'ready', 'database': 'ok'},
        )

    @override_settings(
        SECRET_KEY='must-not-appear-in-health-response',
        DATABASE_URL='postgresql://secret-user:secret-password@database/internal',
    )
    def test_readiness_does_not_expose_sensitive_settings(self):
        response = self.client.get(reverse('readiness'))
        response_body = response.content.decode()

        self.assertEqual(
            response.json(),
            {'status': 'ready', 'database': 'ok'},
        )
        self.assertNotIn('must-not-appear', response_body)
        self.assertNotIn('secret-user', response_body)
        self.assertNotIn('secret-password', response_body)

    @patch('apps.common.views.connection.cursor')
    def test_readiness_returns_503_when_database_fails(self, cursor):
        cursor.side_effect = DatabaseError('internal database details')

        response = self.client.get(reverse('readiness'))

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json(),
            {'status': 'unavailable', 'database': 'error'},
        )

    @override_settings(
        REDIS_URL='redis://secret-user:secret-password@redis.internal:6379/0'
    )
    @patch('apps.common.views.redis_is_available', return_value=False)
    def test_readiness_checks_configured_redis_without_exposing_url(
        self,
        redis_check,
    ):
        response = self.client.get(reverse('readiness'))

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json(),
            {
                'status': 'unavailable',
                'database': 'ok',
                'redis': 'error',
            },
        )
        self.assertNotContains(response, 'secret-user', status_code=503)
        self.assertNotContains(response, 'secret-password', status_code=503)
        redis_check.assert_called_once_with()
