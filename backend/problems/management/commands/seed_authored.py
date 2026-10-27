"""Seed the authored bilingual content pack (content wave CNT-2).

Loads ``problems/fixtures/authored_content.json`` — 62 original bilingual
(EN mandatory + RO) problems authored for WebCoder, each verified on the
live stack by a judge-confirmed AC (reference) and WA (planted wrong
variant) submission pair (ids recorded per problem in the fixture).

Idempotent: matched on the EN title AND the authored license_basis
marker, so pre-existing problems that merely share a title are never
touched.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from problems.models import Problem, Tag, TestCase
from users.models import User

AUTHOR_USERNAME = "seed_author"
AUTHORED_BASIS = (
    "original bilingual problem authored for WebCoder (content wave, "
    "session 2026-10-26)"
)
FIXTURE = Path(__file__).resolve().parent.parent.parent / "fixtures" / "authored_content.json"

#: Static tag slugs -> i18n names (same set the authoring run used).
TAG_NAMES = {
    "implementation": ("Implementation", "Implementare"),
    "loops": ("Loops", "Structuri repetitive"),
    "arrays": ("Arrays", "Tablouri"),
    "sorting": ("Sorting", "Sortare"),
    "binary-search": ("Binary search", "Căutare binară"),
    "strings": ("Strings", "Șiruri de caractere"),
    "math": ("Math", "Matematică"),
    "recursion": ("Recursion", "Recursivitate"),
    "number-theory": ("Number theory", "Teoria numerelor"),
    "dynamic-programming": ("Dynamic programming", "Programare dinamică"),
    "greedy": ("Greedy", "Greedy"),
    "graphs": ("Graphs", "Grafuri"),
    "matrices": ("Matrices", "Matrice"),
}


class Command(BaseCommand):
    help = (
        "Seed the authored bilingual content pack (62 verified EN+RO "
        "problems with testcases). Idempotent per EN title + authored "
        "license_basis marker."
    )

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def _tags(self, slugs):
        out = []
        for slug in slugs:
            en, ro = TAG_NAMES.get(slug, (slug, slug))
            tag, _ = Tag.objects.get_or_create(
                slug=slug, defaults={"name_i18n": {"en": en, "ro": ro}}
            )
            out.append(tag)
        return out

    @transaction.atomic
    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        data = json.loads(FIXTURE.read_text(encoding="utf-8"))
        author, _ = User.objects.get_or_create(
            username=AUTHOR_USERNAME,
            defaults={"role": User.Roles.PROBLEM_CREATOR, "is_active": True},
        )

        created = skipped = 0
        for entry in data["problems"]:
            if Problem.objects.filter(
                title_i18n__en=entry["title_en"], license_basis=AUTHORED_BASIS
            ).exists():
                skipped += 1
                continue
            problem = Problem(
                title_i18n={"en": entry["title_en"], "ro": entry["title_ro"]},
                statement_i18n={
                    "en": entry["statement_en"],
                    "ro": entry["statement_ro"],
                },
                author=author,
                status=Problem.ProblemStatus.APPROVED,
                difficulty=entry["difficulty"],
                difficulty_source=Problem.DifficultySource.SEED,
                comparison_mode=entry["comparison_mode"],
                io_mode=entry["io_mode"],
                allowed_languages=[],
                license_status=Problem.LicenseStatus.OWN,
                license_basis=AUTHORED_BASIS,
            )
            if not dry_run:
                problem.save()
                problem.tags.set(self._tags(entry["tags"]))
                for order, t in enumerate(entry["tests"]):
                    TestCase.objects.create(
                        problem=problem,
                        input_data=t["input"],
                        expected_output_data=t["expected"],
                        is_sample=t["is_sample"],
                        points=t["points"],
                        order=order,
                    )
            created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"seed_authored: {created} created, {skipped} already present"
                + (" (dry run)" if dry_run else "")
            )
        )
