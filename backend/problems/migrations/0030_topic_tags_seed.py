"""Item H — seed the canonical competitive topic tags and keyword-tag the
imported catalog. Idempotent: get_or_create for the tags, additive for the
problem-tag links (never removes an author's own tags).
"""

from django.db import migrations


def seed(apps, schema_editor):
    Tag = apps.get_model("problems", "Tag")
    Problem = apps.get_model("problems", "Problem")
    from problems.seed_data import TAGS, TOPIC_KEYWORDS

    tags_by_slug = {}
    for tag_def in TAGS:
        tag, _ = Tag.objects.get_or_create(
            slug=tag_def["slug"],
            defaults={"name_i18n": {"en": tag_def["en"], "ro": tag_def["ro"]}},
        )
        tags_by_slug[tag_def["slug"]] = tag

    def haystack(problem):
        parts = []
        for field in (problem.title_i18n, problem.statement_i18n):
            if isinstance(field, dict):
                parts.extend(str(v) for v in field.values())
        return " ".join(parts).lower()

    for problem in Problem.objects.prefetch_related("tags").all():
        if problem.tags.exists():
            continue  # authored/imported tags already present — respect them
        text = haystack(problem)
        for slug, needles in TOPIC_KEYWORDS.items():
            if any(needle in text for needle in needles):
                problem.tags.add(tags_by_slug[slug])


def unseed(apps, schema_editor):
    # The seeded tags themselves stay (they are reference data); the
    # reverse only detaches the keyword-derived links.
    Tag = apps.get_model("problems", "Tag")
    Problem = apps.get_model("problems", "Problem")
    from problems.seed_data import TOPIC_KEYWORDS

    slugs = set(TOPIC_KEYWORDS)
    for problem in Problem.objects.all():
        problem.tags.remove(*Tag.objects.filter(slug__in=slugs))


class Migration(migrations.Migration):
    dependencies = [
        ("problems", "0029_problemunlockstate"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
