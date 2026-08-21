import os
import subprocess
import sys

from django.conf import settings
from django.test import SimpleTestCase


EMAIL_ENVIRONMENT_VARIABLES = {
    'EMAIL_BACKEND',
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_HOST_USER',
    'EMAIL_HOST_PASSWORD',
    'EMAIL_USE_TLS',
    'EMAIL_USE_SSL',
    'EMAIL_TIMEOUT',
    'DEFAULT_FROM_EMAIL',
    'SERVER_EMAIL',
}


class EmailSettingsTests(SimpleTestCase):
    def run_settings_check(self, script, environment_overrides=None):
        environment = os.environ.copy()
        for name in EMAIL_ENVIRONMENT_VARIABLES:
            environment.pop(name, None)
        environment.update(environment_overrides or {})
        environment.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

        result = subprocess.run(
            [sys.executable, '-c', script],
            cwd=settings.BASE_DIR,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_local_default_uses_console_backend(self):
        self.run_settings_check(
            """
import django

django.setup()

from django.conf import settings

assert settings.MAILERS == {
    'default': {
        'BACKEND': 'django.core.mail.backends.console.EmailBackend',
    },
}
assert settings.DEFAULT_FROM_EMAIL == 'webmaster@localhost'
assert settings.SERVER_EMAIL == 'root@localhost'
"""
        )

    def test_smtp_environment_configures_default_mailer(self):
        self.run_settings_check(
            """
import django

django.setup()

from django.conf import settings
from django.core.mail import mailers

mailer_config = settings.MAILERS['default']
assert mailer_config['BACKEND'] == 'django.core.mail.backends.smtp.EmailBackend'
assert mailer_config['OPTIONS'] == {
    'host': 'smtp.example.com',
    'port': 587,
    'username': 'smtp-user',
    'password': 'test-only-password',
    'use_tls': True,
    'use_ssl': False,
    'timeout': 15,
}
assert settings.DEFAULT_FROM_EMAIL == 'noreply@example.com'
assert settings.SERVER_EMAIL == 'server-errors@example.com'

mailer = mailers['default']
assert mailer.host == 'smtp.example.com'
assert mailer.port == 587
assert mailer.username == 'smtp-user'
assert mailer.password == 'test-only-password'
assert mailer.use_tls is True
assert mailer.use_ssl is False
assert mailer.timeout == 15
assert mailer.connection is None
""",
            {
                'EMAIL_BACKEND': 'django.core.mail.backends.smtp.EmailBackend',
                'EMAIL_HOST': 'smtp.example.com',
                'EMAIL_PORT': '587',
                'EMAIL_HOST_USER': 'smtp-user',
                'EMAIL_HOST_PASSWORD': 'test-only-password',
                'EMAIL_USE_TLS': 'True',
                'EMAIL_USE_SSL': 'False',
                'EMAIL_TIMEOUT': '15',
                'DEFAULT_FROM_EMAIL': 'noreply@example.com',
                'SERVER_EMAIL': 'server-errors@example.com',
            },
        )

    def test_invalid_email_port_fails(self):
        self.run_settings_check(
            """
from django.core.exceptions import ImproperlyConfigured

try:
    import config.settings
except ImproperlyConfigured as error:
    assert str(error) == 'EMAIL_PORT must be an integer.'
else:
    raise AssertionError('Invalid EMAIL_PORT did not fail.')
""",
            {'EMAIL_PORT': 'not-a-port'},
        )

    def test_tls_and_ssl_cannot_both_be_enabled(self):
        self.run_settings_check(
            """
from django.core.exceptions import ImproperlyConfigured

try:
    import config.settings
except ImproperlyConfigured as error:
    assert str(error) == (
        'EMAIL_USE_TLS and EMAIL_USE_SSL cannot both be True.'
    )
else:
    raise AssertionError('Conflicting email encryption settings did not fail.')
""",
            {
                'EMAIL_USE_TLS': 'True',
                'EMAIL_USE_SSL': 'True',
            },
        )
