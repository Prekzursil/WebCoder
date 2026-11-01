"""Add Problem.library_policy (judge-fairness wave C).

Per-language library bans/allowances + problem-level feature bans,
enforced by problems/feature_policy.py at submit time (400) and judge
time (import guard / compile-time re-scan).
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("problems", "0015_alter_problem_problem_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="problem",
            name="library_policy",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text=(
                    "Per-language library bans and feature bans: "
                    '{"python3": {"banned_stdlib": ["re"], '
                    '"banned": ["numpy"], "allowed": ["sympy"]}, '
                    '"cpp17": {"banned": ["boost"]}, '
                    '"banned_features": ["py-no-string-ops"]}.'
                ),
                verbose_name="library & feature policy",
            ),
        ),
    ]
