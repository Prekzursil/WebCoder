"""Partial-code problems (judge-fairness wave E): template + language.

HackerRank-style skeletons with locked regions, server-verified.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("problems", "0017_problem_block_config"),
    ]

    operations = [
        migrations.AddField(
            model_name="problem",
            name="code_template",
            field=models.TextField(
                blank=True,
                default="",
                help_text=(
                    "Full source skeleton; wrap editable regions in "
                    "WC_EDIT_START / WC_EDIT_END sentinel comment lines."
                ),
                verbose_name="code template (partial-code problems)",
            ),
        ),
        migrations.AddField(
            model_name="problem",
            name="code_template_language",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Registry language id the skeleton is written in.",
                max_length=20,
                verbose_name="template language",
            ),
        ),
    ]
