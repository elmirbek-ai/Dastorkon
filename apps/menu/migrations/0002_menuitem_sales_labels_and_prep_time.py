from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


def convert_zero_prep_times_to_null(apps, schema_editor):
    menu_item = apps.get_model("menu", "MenuItem")
    menu_item.objects.filter(cooking_time_min=0).update(cooking_time_min=None)


def convert_null_prep_times_to_zero(apps, schema_editor):
    menu_item = apps.get_model("menu", "MenuItem")
    menu_item.objects.filter(cooking_time_min__isnull=True).update(
        cooking_time_min=0
    )


class Migration(migrations.Migration):
    dependencies = [
        ("menu", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="menuitem",
            name="cooking_time_min",
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                validators=(MinValueValidator(1), MaxValueValidator(300)),
            ),
        ),
        migrations.RunPython(
            convert_zero_prep_times_to_null,
            convert_null_prep_times_to_zero,
        ),
        migrations.AddField(
            model_name="menuitem",
            name="is_hit",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="menuitem",
            name="is_new",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="menuitem",
            name="is_recommended",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="menuitem",
            name="is_spicy",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="menuitem",
            name="is_vegetarian",
            field=models.BooleanField(default=False),
        ),
    ]
