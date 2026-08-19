from django.db import migrations
import phonenumber_field.modelfields
from phonenumber_field.phonenumber import PhoneNumber


def normalize_existing_phone_numbers(apps, schema_editor):
    User = apps.get_model("users", "User")
    for field_name in ("primary_phone", "secondary_phone"):
        for user in User.objects.exclude(**{field_name: ""}).iterator():
            number = PhoneNumber.from_string(str(getattr(user, field_name)), region="KG")
            User.objects.filter(pk=user.pk).update(
                **{field_name: number.as_e164 if number.is_valid() else ""}
            )


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0003_user_secondary_phone"),
    ]

    operations = [
        migrations.RenameField(
            model_name="user",
            old_name="phone",
            new_name="primary_phone",
        ),
        migrations.AlterField(
            model_name="user",
            name="primary_phone",
            field=phonenumber_field.modelfields.PhoneNumberField(
                blank=True,
                max_length=128,
                region="KG",
            ),
        ),
        migrations.AlterField(
            model_name="user",
            name="secondary_phone",
            field=phonenumber_field.modelfields.PhoneNumberField(
                blank=True,
                max_length=128,
                region="KG",
            ),
        ),
        migrations.RunPython(normalize_existing_phone_numbers, migrations.RunPython.noop),
    ]
