from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase
from django.urls import reverse


class DeploymentRoutingTests(SimpleTestCase):
    def test_django_admin_does_not_conflict_with_react_admin_routes(self):
        self.assertEqual(reverse("admin:index"), "/django-admin/")

    def test_nginx_configs_leave_react_admin_routes_to_spa(self):
        config_paths = (
            Path(settings.BASE_DIR, "docker", "nginx", "default.conf"),
            Path(
                settings.BASE_DIR,
                "deploy",
                "nginx",
                "dastorkon.conf.example",
            ),
        )

        for config_path in config_paths:
            with self.subTest(config_path=config_path):
                config = config_path.read_text(encoding="utf-8")
                self.assertIn("location = /django-admin", config)
                self.assertIn(
                    "location ~ ^/(django-admin|common|notifications)/",
                    config,
                )
                self.assertNotIn("location = /admin", config)
                self.assertNotIn(
                    "location ~ ^/(admin|common|notifications)/",
                    config,
                )
