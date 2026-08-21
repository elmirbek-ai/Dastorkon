import os
import subprocess
import sys

from django.conf import settings
from django.test import SimpleTestCase


class LoggingSettingsTests(SimpleTestCase):
    def run_settings_check(self, script, environment_overrides=None):
        environment = os.environ.copy()
        for name in ('DEBUG', 'SECRET_KEY', 'LOG_LEVEL'):
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

    def test_local_default_log_level_is_debug(self):
        self.run_settings_check(
            """
import config.settings as settings

assert settings.DEBUG is True
assert settings.LOG_LEVEL == 'DEBUG'
assert settings.LOGGING['handlers']['console']['level'] == 'DEBUG'
assert settings.LOGGING['handlers']['console']['stream'] == 'ext://sys.stdout'
assert settings.LOGGING['loggers']['django.db.backends']['level'] == 'WARNING'
"""
        )

    def test_production_default_log_level_is_info(self):
        self.run_settings_check(
            """
import config.settings as settings

assert settings.DEBUG is False
assert settings.LOG_LEVEL == 'INFO'
assert settings.LOGGING['handlers']['console']['level'] == 'INFO'
""",
            {
                'DEBUG': 'False',
                'SECRET_KEY': 'test-only-production-secret-key',
            },
        )

    def test_log_level_environment_override_is_normalized(self):
        self.run_settings_check(
            """
import config.settings as settings

assert settings.LOG_LEVEL == 'WARNING'
assert settings.LOGGING['handlers']['console']['level'] == 'WARNING'
assert settings.LOGGING['root']['level'] == 'WARNING'
""",
            {'LOG_LEVEL': 'warning'},
        )
