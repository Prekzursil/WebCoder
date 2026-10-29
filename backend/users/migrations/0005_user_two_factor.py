"""OPS-2: TOTP two-factor fields on the user model."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0004_user_county_user_is_minor_user_school"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="two_factor_secret",
            field=models.CharField(
                blank=True,
                help_text="Base32 TOTP secret while enrolling or enrolled (OPS-2).",
                max_length=64,
                verbose_name="TOTP secret",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="two_factor_enabled",
            field=models.BooleanField(
                default=False,
                help_text="TOTP verified at least once (OPS-2).",
                verbose_name="two-factor enabled",
            ),
        ),
    ]
