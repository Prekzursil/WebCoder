"""EDU-10 (Wave D): the VERY_EASY beginner difficulty band."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("problems", "0013_problem_interactive"),
    ]

    operations = [
        migrations.AlterField(
            model_name="problem",
            name="difficulty",
            field=models.CharField(
                choices=[
                    ("VERY_EASY", "Very easy"),
                    ("EASY", "Easy"),
                    ("MEDIUM", "Medium"),
                    ("HARD", "Hard"),
                ],
                default="MEDIUM",
                max_length=10,
                verbose_name="difficulty",
            ),
        ),
    ]
