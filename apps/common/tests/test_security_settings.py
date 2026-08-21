import os
import subprocess
import sys

from django.conf import settings
from django.test import SimpleTestCase


SECURITY_ENVIRONMENT_VARIABLES = {
    'DEBUG',
    'SECRET_KEY',
    'SECURE_PROXY_SSL_HEADER',
    'SECURE_SSL_REDIRECT',
    'SESSION_COOKIE_SECURE',
    'CSRF_COOKIE_SECURE',
    'SECURE_HSTS_SECONDS',
    'SECURE_HSTS_INCLUDE_SUBDOMAINS',
    'SECURE_HSTS_PRELOAD',
    'SECURE_CONTENT_TYPE_NOSNIFF',
    'SECURE_REFERRER_POLICY',
    'X_FRAME_OPTIONS',
}


class SecuritySettingsTests(SimpleTestCase):
    def run_settings_check(self, script, environment_overrides=None):
        environment = os.environ.copy()
        for name in SECURITY_ENVIRONMENT_VARIABLES:
            environment.pop(name, None)
        environment.update(environment_overrides or {})

        result = subprocess.run(
            [sys.executable, '-c', script],
            cwd=settings.BASE_DIR,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_local_defaults_do_not_require_https(self):
        self.run_settings_check(
            """
import config.settings as settings

assert settings.DEBUG is True
assert settings.SECURE_SSL_REDIRECT is False
assert settings.SESSION_COOKIE_SECURE is False
assert settings.CSRF_COOKIE_SECURE is False
assert settings.SECURE_HSTS_SECONDS == 0
assert settings.SECURE_HSTS_INCLUDE_SUBDOMAINS is False
assert settings.SECURE_HSTS_PRELOAD is False
assert not hasattr(settings, 'SECURE_PROXY_SSL_HEADER')
"""
        )

    def test_production_environment_enables_security_settings(self):
        self.run_settings_check(
            """
import config.settings as settings

assert settings.DEBUG is False
assert settings.SECURE_PROXY_SSL_HEADER == (
    'HTTP_X_FORWARDED_PROTO',
    'https',
)
assert settings.SECURE_SSL_REDIRECT is True
assert settings.SESSION_COOKIE_SECURE is True
assert settings.CSRF_COOKIE_SECURE is True
assert settings.SECURE_HSTS_SECONDS == 300
assert settings.SECURE_HSTS_INCLUDE_SUBDOMAINS is True
assert settings.SECURE_HSTS_PRELOAD is True
assert settings.SECURE_CONTENT_TYPE_NOSNIFF is True
assert settings.SECURE_REFERRER_POLICY == 'strict-origin-when-cross-origin'
assert settings.X_FRAME_OPTIONS == 'SAMEORIGIN'
""",
            {
                'DEBUG': 'False',
                'SECRET_KEY': 'test-only-production-secret-key',
                'SECURE_PROXY_SSL_HEADER': 'True',
                'SECURE_SSL_REDIRECT': 'True',
                'SESSION_COOKIE_SECURE': 'True',
                'CSRF_COOKIE_SECURE': 'True',
                'SECURE_HSTS_SECONDS': '300',
                'SECURE_HSTS_INCLUDE_SUBDOMAINS': 'True',
                'SECURE_HSTS_PRELOAD': 'True',
                'SECURE_CONTENT_TYPE_NOSNIFF': 'True',
                'SECURE_REFERRER_POLICY': 'strict-origin-when-cross-origin',
                'X_FRAME_OPTIONS': 'SAMEORIGIN',
            },
        )
