"""ANA-1 (Wave D): weekly owner-analytics snapshots."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0005_user_two_factor"),
    ]

    operations = [
        migrations.CreateModel(
            name="OwnerWeeklySnapshot",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "week",
                    models.CharField(
                        db_index=True,
                        help_text="ISO year-week key, e.g. 2026-W44.",
                        max_length=8,
                        unique=True,
                        verbose_name="ISO week",
                    ),
                ),
                (
                    "captured_at",
                    models.DateTimeField(auto_now=True, verbose_name="captured at"),
                ),
                (
                    "payload",
                    models.JSONField(
                        help_text="The activation_snapshot() derivations for the week.",
                        verbose_name="metrics payload",
                    ),
                ),
            ],
            options={
                "verbose_name": "owner weekly snapshot",
                "verbose_name_plural": "owner weekly snapshots",
                "ordering": ["-week"],
            },
        ),
    ]
