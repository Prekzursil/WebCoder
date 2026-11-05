"""Add Problem.block_config (judge-fairness wave D: Scratch on site).

Per-problem Blockly block sets — the site renders a block editor for the
problem, generates python/js source, and submits through the normal judge.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("problems", "0016_problem_library_policy"),
    ]

    operations = [
        migrations.AddField(
            model_name="problem",
            name="block_config",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text=(
                    "Blockly config: {generator: 'python3'|'nodejs20', "
                    "toolbox: <xml>, starter: <xml>}. Empty = not a block "
                    "problem."
                ),
                verbose_name="block programming config",
            ),
        ),
    ]
