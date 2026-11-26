"""Topic-tag seeding tests (problem-page wave, item H).

Covers the migration's forward/reverse pass against the real seed data
shapes: canonical tag creation, keyword auto-tagging of untagged
problems, and respect for problems that already carry tags.
"""

from django.test import TestCase

from problems.models import Problem, Tag
from problems.seed_data import TAGS, TOPIC_KEYWORDS


def _mk(title_en, statement_en, tags=None):
    problem = Problem.objects.create(
        title_i18n={"en": title_en},
        statement_i18n={"en": statement_en},
        difficulty="MEDIUM",
        target_points=100,
    )
    if tags:
        problem.tags.set(tags)
    return problem


def _mod():
    import importlib

    return importlib.import_module("problems.migrations.0030_topic_tags_seed")


class TopicSeedTest(TestCase):
    def test_seed_via_migrate(self):
        from django.apps import apps

        mod = _mod()
        mod.seed(apps, None)

        slugs = {t["slug"] for t in TAGS}
        self.assertGreaterEqual(
            Tag.objects.filter(slug__in=slugs).count(), len(TOPIC_KEYWORDS)
        )
        dp = _mk(
            "Max Sum",
            "Solve with dynamic programming over the prefix sums.",
        )
        graph = _mk(
            "Roads",
            "Given a graph with adjacency lists, find the shortest path.",
        )
        tagged = _mk(
            "Sorted", "Sort the numbers.", tags=[Tag.objects.get(slug="sorting")]
        )
        mod.seed(apps, None)
        self.assertIn(Tag.objects.get(slug="dp"), dp.tags.all())
        self.assertIn(Tag.objects.get(slug="graphs"), graph.tags.all())
        self.assertIn(Tag.objects.get(slug="bfs"), graph.tags.all())
        # Already-tagged problems are respected (no keyword additions).
        self.assertEqual(set(tagged.tags.values_list("slug", flat=True)), {"sorting"})

    def test_unseed_detaches_keyword_links(self):
        from django.apps import apps

        mod = _mod()
        mod.seed(apps, None)
        dp = _mk("DP again", "dynamic programming everywhere")
        mod.seed(apps, None)
        self.assertTrue(dp.tags.exists())
        mod.unseed(apps, None)
        self.assertEqual(
            set(dp.tags.values_list("slug", flat=True)) & set(TOPIC_KEYWORDS),
            set(),
        )

    def test_ro_locale_needles_match(self):
        from django.apps import apps

        mod = _mod()
        mod.seed(apps, None)
        ro = Problem.objects.create(
            title_i18n={"ro": "Drumuri"},
            statement_i18n={"ro": "Se dă un graf neorientat."},
            difficulty="MEDIUM",
            target_points=100,
        )
        mod.seed(apps, None)
        self.assertIn(Tag.objects.get(slug="graphs"), ro.tags.all())

    def test_imported_modules_names_are_discoverable(self):
        mod = _mod()
        self.assertTrue(callable(mod.seed) and callable(mod.unseed))
