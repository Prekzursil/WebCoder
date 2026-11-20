"""Rebuild the imported problem catalog from the committed fixture.

Counterpart of `export_catalog`. On a fresh environment:

    python manage.py migrate
    python manage.py seed_problems          # starter pack + curriculum + tags
    python manage.py import_catalog         # the imported archive (fixture)

Matching is by the fixture key (source_url, or `wc:<export-id>` for
hand-authored rows) and, failing that, by exact EN title — so re-imports
update in place instead of duplicating. Unknown tag slugs are created on
the fly (seeded curriculum nodes are reused by slug). Authors/verifiers
are resolved by username; a missing account falls back to the seed
author (created if needed) so imports never depend on user rows.
"""

import gzip
import json
import os
import tempfile
import urllib.request
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from problems.models import CurriculumNode, ImportSource, Problem, Tag, TestCase
from users.models import User

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "catalog"

FALLBACK_AUTHOR = "catalog_importer"

#: Fields the importer copies verbatim from the fixture row onto the model.
PROBLEM_FIELDS = (
    "title_i18n",
    "statement_i18n",
    "hints_ro",
    "hints_en",
    "status",
    "difficulty",
    "problem_type",
    "scoring_mode",
    "comparison_mode",
    "io_mode",
    "io_input_filename",
    "io_output_filename",
    "default_time_limit_ms",
    "default_memory_limit_kb",
    "limit_overrides",
    "allowed_languages",
    "source_url",
    "source_name",
    "source_authors",
    "alt_sources",
    "source_contest",
    "source_year",
    "grade_group",
    "difficulty_source",
    "verifier_feedback",
    "reference_solution_code",
    "reference_language",
)


def _read(path):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        return json.load(fh)


RELEASE_BASE = "https://github.com/Prekzursil/WebCoder/releases/download"


def _fetch_release(tag):
    """Download the catalog fixture attached to a GitHub release.

    The full 2026-11 snapshot is ~110 MB gzipped (240 MB of test data) —
    too heavy for the git tree, so it ships as a release asset and the
    repo keeps only the tooling plus the small ledger/curriculum files.
    """
    base = os.environ.get("CATALOG_RELEASE_BASE", RELEASE_BASE)
    url = f"{base}/{tag}/problems.json.gz"
    dest = Path(tempfile.gettempdir()) / f"webcoder-catalog-{tag}.json.gz"
    if not dest.exists():
        urllib.request.urlretrieve(url, dest)
    return str(dest)


def get_user(username):
    if username:
        user = User.objects.filter(username=username).first()
        if user:
            return user
    user, _ = User.objects.get_or_create(
        username=FALLBACK_AUTHOR,
        defaults={"role": User.Roles.PROBLEM_CREATOR, "is_active": True},
    )
    return user


class Command(BaseCommand):
    help = "Import the committed catalog fixture (idempotent, keyed on source_url / EN title)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument(
            "--file", default=str(DATA_DIR / "problems.json.gz"), help="Fixture file."
        )
        parser.add_argument(
            "--from-release",
            default="",
            metavar="TAG",
            help=(
                "Download the problems fixture from the GitHub release TAG "
                "(asset problems.json.gz) instead of a local file. The base "
                "URL is overridable via CATALOG_RELEASE_BASE for mirrors."
            ),
        )

    def handle(self, *args, **options):
        if options["from_release"]:
            options["file"] = _fetch_release(options["from_release"])
        dry = options["dry_run"]
        self._import_sources(Path(options["file"]).with_name("sources.json.gz"))
        payload = _read(Path(options["file"]))
        created = updated = tests = 0
        with transaction.atomic():
            for row in payload["problems"]:
                key = row.get("key") or ""
                problem = None
                if key.startswith("http"):
                    problem = Problem.objects.filter(source_url=key).first()
                if problem is None:
                    problem = Problem.objects.filter(
                        title_i18n__en=row["title_i18n"].get("en", "")
                    ).first()
                if problem is None:
                    created += 1
                    if dry:
                        continue
                    problem = Problem(
                        title_i18n=row["title_i18n"],
                        statement_i18n=row["statement_i18n"],
                        author=get_user(row.get("author")),
                    )
                else:
                    updated += 1
                if dry:
                    continue
                for field in PROBLEM_FIELDS:
                    setattr(problem, field, row.get(field))
                problem.author = get_user(row.get("author"))
                problem.verifier = get_user(row.get("verifier"))
                problem.save()
                problem.tags.set(
                    Tag.objects.get_or_create(
                        slug=slug,
                        defaults={"name_i18n": {"en": slug, "ro": slug}},
                    )[0]
                    for slug in row.get("tags", [])
                )
                nodes = CurriculumNode.objects.filter(
                    slug__in=row.get("curriculum", [])
                )
                problem.curriculum_nodes.set(nodes)
                TestCase.objects.filter(problem=problem).delete()
                for tc in row.get("tests", []):
                    TestCase.objects.create(problem=problem, **tc)
                    tests += 1
        suffix = " (dry-run)" if dry else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"import: {created} created, {updated} updated, {tests} tests{suffix}"
            )
        )

    def _import_sources(self, path):
        """Restore the CNT-2 permission ledger (no-op when absent/empty)."""
        if not path.exists():
            return
        for row in _read(path).get("sources", []):
            obj, created = ImportSource.objects.get_or_create(
                name=row["name"],
                defaults={
                    "contact": row["contact"],
                    "terms": row["terms"],
                    "granted_at": row["granted_at"],
                    "evidence_url": row["evidence_url"],
                    "status": row["status"],
                    "notes": row["notes"],
                },
            )
            if created:
                self.stdout.write(f"import source: {row['name']}")
