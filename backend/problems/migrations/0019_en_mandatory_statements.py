"""EN-mandatory i18n normalization (i18n & translation platform wave).

Owner rule (d): English is the universal fallback, so every problem must
expose an English title + statement. Legacy rows written before the rule
may lack a usable ``en`` entry; this data migration repairs them by
copying the Romanian value when present, else the first non-empty locale
(the repair helper lives in problems.i18n_fields so it is unit-tested —
migrations themselves are excluded from coverage by policy).

Seeded problems already ship both ``en`` and ``ro``
(problems/seed_data.py) and pass through unchanged.
"""

from django.db import migrations


def normalize(apps, schema_editor):
    Problem = apps.get_model("problems", "Problem")
    from problems.i18n_fields import ensure_english

    repaired = 0
    for problem in Problem.objects.all():
        new_title = ensure_english(problem.title_i18n, field_name="title_i18n")
        new_statement = ensure_english(
            problem.statement_i18n, field_name="statement_i18n"
        )
        if (
            new_title is not problem.title_i18n
            or new_statement is not problem.statement_i18n
        ):
            problem.title_i18n = new_title
            problem.statement_i18n = new_statement
            problem.save(update_fields=["title_i18n", "statement_i18n"])
            repaired += 1
    if repaired:
        print(
            f"[0019_en_mandatory_statements] repaired English fallback on {repaired} problem(s)"
        )


def unnormalize(apps, schema_editor):
    # Forward-only data repair: the original (possibly missing) EN values
    # are not recorded, so there is nothing sound to restore.
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("problems", "0018_partial_code"),
    ]

    operations = [
        migrations.RunPython(normalize, unnormalize),
    ]
