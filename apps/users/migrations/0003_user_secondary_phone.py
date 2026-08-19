from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0002_waitershift"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="secondary_phone",
            field=models.CharField(blank=True, max_length=32),
        ),
    ]
