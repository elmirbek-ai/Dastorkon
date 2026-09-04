import django.db.models.deletion
from django.db import migrations, models


def populate_customer_session_tables(apps, schema_editor):
    CustomerSession = apps.get_model("tables", "CustomerSession")
    for customer_session in CustomerSession.objects.select_related(
        "active_table_session__table"
    ).iterator():
        customer_session.table_id = customer_session.active_table_session.table_id
        customer_session.save(update_fields=("table",))


class Migration(migrations.Migration):
    dependencies = [
        ("tables", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="customersession",
            name="table",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="customer_sessions",
                to="tables.restauranttable",
            ),
        ),
        migrations.RunPython(
            populate_customer_session_tables,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="customersession",
            name="table",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="customer_sessions",
                to="tables.restauranttable",
            ),
        ),
        migrations.AlterField(
            model_name="customersession",
            name="active_table_session",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="customer_sessions",
                to="tables.activetablesession",
            ),
        ),
    ]
