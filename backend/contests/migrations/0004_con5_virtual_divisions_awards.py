"""CON-5 virtual participations, CON-7 division bands, CON-11 awards.

- Split the single (contest, user) uniqueness into one-official + one-
  virtual conditional constraints so a finished contestant may replay.
- Add Contest.rated_rating_min/max division gates and the ContestAward
  medal table.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("contests", "0003_contest_ratings_discarded"),
    ]

    operations = [
        migrations.AddField(
            model_name="contestparticipation",
            name="is_virtual",
            field=models.BooleanField(
                default=False, verbose_name="virtual (replay)"
            ),
        ),
        migrations.RemoveConstraint(
            model_name="contestparticipation",
            name="unique_contest_user",
        ),
        migrations.AddConstraint(
            model_name="contestparticipation",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_virtual=False),
                fields=("contest", "user"),
                name="unique_official_participation",
            ),
        ),
        migrations.AddConstraint(
            model_name="contestparticipation",
            constraint=models.UniqueConstraint(
                condition=models.Q(is_virtual=True),
                fields=("contest", "user"),
                name="unique_virtual_participation",
            ),
        ),
        migrations.AddField(
            model_name="contest",
            name="rated_rating_min",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Registration gate: caller's display rating must be >= this.",
                null=True,
                verbose_name="minimum display rating",
            ),
        ),
        migrations.AddField(
            model_name="contest",
            name="rated_rating_max",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="Registration gate: caller's display rating must be <= this.",
                null=True,
                verbose_name="maximum display rating",
            ),
        ),
        migrations.CreateModel(
            name="ContestAward",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "medal",
                    models.CharField(
                        choices=[
                            ("GOLD", "Gold"),
                            ("SILVER", "Silver"),
                            ("BRONZE", "Bronze"),
                        ],
                        max_length=6,
                        verbose_name="medal",
                    ),
                ),
                (
                    "rank",
                    models.PositiveIntegerField(
                        help_text="Official standings position when awarded.",
                        verbose_name="final rank",
                    ),
                ),
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True),
                ),
                (
                    "contest",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="awards",
                        to="contests.contest",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="contest_awards",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "contest award",
                "verbose_name_plural": "contest awards",
                "ordering": ["contest", "rank"],
            },
        ),
        migrations.AddConstraint(
            model_name="contestaward",
            constraint=models.UniqueConstraint(
                fields=("contest", "user"), name="unique_award"
            ),
        ),
    ]
