"""Tests for the seed_authored management command (content wave CNT-2)."""

import json
from io import StringIO
from pathlib import Path
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from problems.management.commands.seed_authored import (
    AUTHORED_BASIS,
    FIXTURE,
)
from problems.models import Problem, Tag
from problems.models import TestCase as ProblemTestCase

MINI_FIXTURE = {
    "version": 1,
    "generated": "2026-10-27",
    "license": "own",
    "problems": [
        {
            "slug": "mini-a",
            "title_en": "Mini A",
            "title_ro": "Mini A (RO)",
            "statement_en": "EN body",
            "statement_ro": "RO body",
            "difficulty": "EASY",
            "tags": ["math", "graphs"],
            "comparison_mode": "LINES_STRIP_EXACT",
            "io_mode": "STDIO",
            "tests": [
                {"input": "1 2\n", "expected": "3\n", "is_sample": True, "points": 10},
                {"input": "0 0\n", "expected": "0\n", "is_sample": False, "points": 10},
            ],
            "verified": {"problem_id": 1, "ac_submission": 1, "wa_submission": 2},
        },
        {
            "slug": "mini-b",
            "title_en": "Mini B",
            "title_ro": "Mini B (RO)",
            "statement_en": "EN b",
            "statement_ro": "RO b",
            "difficulty": "HARD",
            "tags": ["dynamic-programming"],
            "comparison_mode": "LINES_STRIP_EXACT",
            "io_mode": "STDIO",
            "tests": [
                {"input": "5\n", "expected": "120\n", "is_sample": True, "points": 10}
            ],
            "verified": {"problem_id": 2, "ac_submission": 3, "wa_submission": 4},
        },
    ],
}


def run_command(*args):
    out = StringIO()
    call_command("seed_authored", *args, stdout=out)
    return out.getvalue()


class SeedAuthoredTest(TestCase):
    def seed_mini(self):
        with mock.patch.object(
            Path, "read_text", return_value=json.dumps(MINI_FIXTURE)
        ):
            return run_command()

    def test_creates_problems_tags_and_tests(self):
        out = self.seed_mini()
        self.assertIn("2 created, 0 already present", out)
        a = Problem.objects.get(title_i18n__en="Mini A")
        self.assertEqual(a.statement_i18n["ro"], "RO body")
        self.assertEqual(a.license_status, "own")
        self.assertEqual(a.license_basis, AUTHORED_BASIS)
        self.assertEqual(a.io_mode, "STDIO")
        self.assertEqual(a.difficulty_source, "SEED")
        self.assertEqual(a.status, "APPROVED")
        self.assertEqual(a.test_cases.count(), 2)
        self.assertTrue(a.test_cases.get(order=0).is_sample)
        self.assertFalse(a.test_cases.get(order=1).is_sample)
        self.assertEqual(a.full_score, 20)
        self.assertTrue(
            Tag.objects.filter(slug="dynamic-programming").exists()
        )

    def test_idempotent_rerun_skips_existing(self):
        self.seed_mini()
        out = self.seed_mini()
        self.assertIn("0 created, 2 already present", out)
        self.assertEqual(Problem.objects.filter(license_basis=AUTHORED_BASIS).count(), 2)

    def test_same_title_different_basis_is_untouched_and_not_deduped(self):
        """A pre-existing problem sharing the EN title but not the authored
        marker must neither be reused nor block seeding."""
        Problem.objects.create(
            title_i18n={"en": "Mini A"},
            statement_i18n={"en": "legacy"},
            license_basis="",
        )
        out = self.seed_mini()
        self.assertIn("2 created", out)
        self.assertEqual(
            Problem.objects.filter(title_i18n__en="Mini A").count(), 2
        )

    def test_dry_run_writes_nothing(self):
        with mock.patch.object(
            Path, "read_text", return_value=json.dumps(MINI_FIXTURE)
        ):
            out = run_command("--dry-run")
        self.assertIn("2 created, 0 already present (dry run)", out)
        self.assertEqual(Problem.objects.count(), 0)
        self.assertEqual(ProblemTestCase.objects.count(), 0)

    def test_shipped_fixture_is_valid_and_verified(self):
        """The real shipped fixture parses, has 60+ bilingual problems with
        EN+RO statements, at least one sample test each, and an AC/WA
        verification record per problem."""
        data = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(data["problems"]), 60)
        for entry in data["problems"]:
            self.assertTrue(entry["statement_en"])
            self.assertTrue(entry["statement_ro"])
            self.assertTrue(entry["title_en"])
            tests = entry["tests"]
            self.assertGreaterEqual(len(tests), 5)
            self.assertTrue(any(t["is_sample"] for t in tests))
            v = entry["verified"]
            self.assertIsNotNone(v["problem_id"])
            self.assertIsNotNone(v["ac_submission"])
            self.assertIsNotNone(v["wa_submission"])
