"""OPS-7 (Wave D): sponsor attribution rails on contests — display only,
no payment flow."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("contests", "0004_con5_virtual_divisions_awards"),
    ]

    operations = [
        migrations.AddField(
            model_name="contest",
            name="sponsor_name",
            field=models.CharField(
                blank=True,
                help_text="Attribution shown on the contest page and standings.",
                max_length=160,
                verbose_name="sponsor name",
            ),
        ),
        migrations.AddField(
            model_name="contest",
            name="sponsor_logo_url",
            field=models.URLField(
                blank=True,
                help_text="Optional logo rendered beside the sponsor name.",
                verbose_name="sponsor logo URL",
            ),
        ),
    ]
