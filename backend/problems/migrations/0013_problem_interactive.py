"""Interactive problems (competitive roadmap JDG-2): problem_type +
interactor source fields."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("problems", "0012_importsource_problem_grade_group_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="problem",
            name="problem_type",
            field=models.CharField(
                choices=[
                    ("NORMAL", "Normal (batch tests)"),
                    ("INTERACTIVE", "Interactive (interactor protocol)"),
                ],
                default="NORMAL",
                help_text=(
                    "INTERACTIVE problems are judged by an interactor "
                    "program talking to the submission over stdin/stdout."
                ),
                max_length=12,
                verbose_name="problem type",
            ),
        ),
        migrations.AddField(
            model_name="problem",
            name="interactor_code",
            field=models.TextField(
                blank=True,
                help_text=(
                    "Interactor program (required for INTERACTIVE "
                    "problems). Receives the test input file as argv[1] "
                    "and the answer file as argv[2], talks to the "
                    "submission over stdin/stdout, and reports the verdict "
                    "via exit code (checker protocol v2)."
                ),
                null=True,
                verbose_name="interactor code",
            ),
        ),
        migrations.AddField(
            model_name="problem",
            name="interactor_language",
            field=models.CharField(
                blank=True,
                help_text="Language id of the interactor (e.g. 'cpp17', 'python3').",
                max_length=50,
                null=True,
                verbose_name="interactor language",
            ),
        ),
    ]
