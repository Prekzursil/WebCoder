"""Import the deduped problem catalog into platform content (content wave).

Reads the harvest wave's deduped catalog JSONL (one JSON object per cluster
with a ``canonical`` row and ``members``) plus the offline statement
archive, and applies the binding licensing rules:

- full-import buckets (``own`` / ``licensed`` / ``public-exam`` /
  ``trivial``) become complete public problems — statement (EN mandatory,
  RO where available), tags, difficulty, sample testcases, limits, I/O
  mode and full source attribution;
- ``reference-only`` rows (and full-import rows whose statement was not
  archived) are recorded as internal :class:`CatalogEntry` metadata only —
  no public statement copy is ever created for them.

The command is idempotent: each cluster is processed at most once, keyed by
``CatalogEntry.cluster_id`` (with a (source, source_id) uniqueness net).

Example::

    python manage.py import_catalog \\
        --catalog problem-catalog-deduped.jsonl \\
        --archive-dir archive/ \\
        --translations seed_translations.json
"""

from __future__ import annotations

import json
import os
from typing import Any

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from problems import catalog_import as ci
from problems.models import CatalogEntry, Problem, Tag, TestCase
from users.models import User

IMPORTER_USERNAME = "catalog_importer"


def get_importer_user() -> User:
    user, _ = User.objects.get_or_create(
        username=IMPORTER_USERNAME,
        defaults={"role": User.Roles.PROBLEM_CREATOR, "is_active": True},
    )
    return user


class Command(BaseCommand):
    help = (
        "Import the deduped problem catalog: full-import buckets become "
        "public problems with attribution; reference-only rows become "
        "internal metadata only."
    )

    def add_arguments(self, parser):
        parser.add_argument("--catalog", required=True, help="Deduped catalog JSONL.")
        parser.add_argument(
            "--archive-dir",
            default=None,
            help="Offline statement archive root (needed for full imports).",
        )
        parser.add_argument(
            "--translations",
            default=None,
            help=(
                "JSON map '<source>:<sourceId>' -> {title_en, statement_en} "
                "with human-reviewed English translations."
            ),
        )
        parser.add_argument(
            "--en-mode",
            choices=["require", "stub"],
            default="require",
            help=(
                "require: skip rows lacking an EN translation (counted as "
                "pending_translation). stub: build an honest EN scaffold."
            ),
        )
        parser.add_argument(
            "--statuses",
            default="own,licensed,public-exam,trivial",
            help="Comma-separated license buckets to full-import.",
        )
        parser.add_argument(
            "--sources", default=None, help="Comma-separated source filter."
        )
        parser.add_argument("--limit", type=int, default=None)
        parser.add_argument("--dry-run", action="store_true")

    def _load_translations(self, path: str | None) -> dict[str, dict[str, str]]:
        if not path:
            return {}
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)

    def _archive_entry(
        self, archive_dir: str | None, source: str, source_id: str
    ) -> dict[str, Any] | None:
        if not archive_dir:
            return None
        path = os.path.join(archive_dir, source, f"{source_id}.json")
        if not os.path.exists(path):
            return None
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)

    def _tag_for(self, descriptor: dict[str, str]) -> Tag:
        tag, _ = Tag.objects.get_or_create(
            slug=descriptor["slug"],
            defaults={"name_i18n": {"en": descriptor["en"], "ro": descriptor["ro"]}},
        )
        return tag

    def _build_problem(
        self,
        canonical: dict[str, Any],
        entry: dict[str, Any],
        translation: dict[str, str],
        members: list[dict[str, Any]] | None = None,
    ) -> Problem:
        source = canonical["source"]
        source_name = ci.extract_source_name(canonical)
        statement_ro = ci.clean_statement(source, entry)
        samples = entry.get("samples") or []
        title_en = translation.get("title_en") or canonical.get("title", "")
        statement_en = translation.get("statement_en")
        if not statement_en:
            if source == "dmoj" and statement_ro:
                # DMOJ mirrors (CCO/IOI-style) are natively English.
                statement_en = statement_ro
            else:
                statement_en = ci.build_stub_statement_en(
                    canonical.get("title", ""), source_name, statement_ro, samples
                )

        is_own = ci.is_own_content(canonical.get("attribution"))
        license_status = (
            Problem.LicenseStatus.OWN
            if is_own
            else canonical.get("licenseStatus", Problem.LicenseStatus.REFERENCE_ONLY)
        )
        if is_own:
            license_basis = (
                "owner's own content (posted under the owner's Prekzursil "
                "account); full rights (rule a)"
            )
        else:
            license_basis = canonical.get("licenseBasis", "")

        time_ms, memory_kb = ci.parse_limits(entry)
        io_mode, in_name, out_name = ci.detect_io_mode(entry)

        # Dedupe-merged mirrors (cross-source duplicates of the same
        # classic): every non-canonical member becomes an alt-source record
        # on the problem so the mirror judges stay credited.
        alt_sources = [
            {
                "source": str(m.get("source", "")),
                "sourceId": str(m.get("sourceId", "")),
                "sourceUrl": str(m.get("sourceUrl", "")),
                "title": str(m.get("title", ""))[:512],
            }
            for m in (members or [])
            if not m.get("isCanonical")
            and m.get("source")
            and m.get("sourceId") is not None
        ]

        title_i18n: dict[str, str] = {"en": title_en}
        statement_i18n: dict[str, str] = {"en": statement_en}
        if statement_ro and source != "dmoj":
            title_i18n["ro"] = canonical.get("title", "")
            statement_i18n["ro"] = statement_ro

        problem = Problem(
            title_i18n=title_i18n,
            statement_i18n=statement_i18n,
            author=self.importer,
            status=Problem.ProblemStatus.APPROVED
            if samples
            else Problem.ProblemStatus.PENDING_APPROVAL,
            difficulty=ci.map_difficulty(canonical.get("difficultyProxy")),
            difficulty_source=Problem.DifficultySource.AUTHOR,
            default_time_limit_ms=time_ms,
            default_memory_limit_kb=memory_kb,
            allowed_languages=[],
            io_mode=io_mode,
            io_input_filename=in_name,
            io_output_filename=out_name,
            source_name=source_name,
            source_url=canonical.get("sourceUrl", ""),
            source_authors=ci.parse_authors(entry),
            license_status=license_status,
            license_basis=license_basis[:500],
            alt_sources=alt_sources,
        )
        problem.save()
        for descriptor in ci.map_tags(canonical):
            problem.tags.add(self._tag_for(descriptor))
        points = ci.points_for(len(samples))
        for order, (sample, pts) in enumerate(zip(samples, points)):
            TestCase.objects.create(
                problem=problem,
                input_data=str(sample.get("in", "")),
                expected_output_data=str(sample.get("out", "")),
                is_sample=True,
                points=pts,
                order=order,
            )
        return problem

    @transaction.atomic
    def handle(self, *args, **options):
        catalog_path = options["catalog"]
        if not os.path.exists(catalog_path):
            raise CommandError(f"catalog not found: {catalog_path}")

        statuses = {s.strip() for s in options["statuses"].split(",") if s.strip()}
        sources = (
            {s.strip() for s in options["sources"].split(",") if s.strip()}
            if options["sources"]
            else None
        )
        translations = self._load_translations(options["translations"])
        dry_run = options["dry_run"]
        self.importer = get_importer_user()

        stats = {
            "imported": 0,
            "pending_translation": 0,
            "metadata_only": 0,
            "skipped_existing": 0,
        }

        with open(catalog_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                cluster = json.loads(line)
                canonical = cluster.get("canonical") or {}
                source = canonical.get("source", "")
                if sources and source not in sources:
                    continue

                cluster_id = cluster.get("clusterId")
                if not cluster_id:
                    continue
                if CatalogEntry.objects.filter(cluster_id=cluster_id).exists():
                    stats["skipped_existing"] += 1
                    continue

                # Licensing bucket: own-marker detection overrides the row's
                # default bucket (rule a: own content, full rights).
                row_status = canonical.get("licenseStatus", "reference-only")
                is_own = ci.is_own_content(canonical.get("attribution"))
                effective = "own" if is_own else row_status

                entry = self._archive_entry(
                    options["archive_dir"], source, str(canonical.get("sourceId", ""))
                )
                statement = bool(entry) and bool(
                    ci.clean_statement(source, entry)
                    or entry.get("statementMarkdown")
                )

                full_import = (
                    effective in statuses
                    and effective in ci.FULL_IMPORT_STATUSES
                    and entry is not None
                    and statement
                )

                problem = None
                stats_pending = False
                if full_import:
                    key = f"{source}:{canonical.get('sourceId')}"
                    translation = translations.get(key, {})
                    if (
                        options["en_mode"] == "require"
                        and not translation.get("statement_en")
                        and source != "dmoj"  # dmoj statements are natively EN
                    ):
                        stats["pending_translation"] += 1
                        stats_pending = True
                    else:
                        if not dry_run:
                            problem = self._build_problem(
                                canonical,
                                entry,
                                translation,
                                members=cluster.get("members"),
                            )
                        stats["imported"] += 1
                else:
                    stats["metadata_only"] += 1

                if stats_pending or dry_run:
                    # Pending-translation rows stay unrecorded so a later
                    # run with translations can still import them; dry runs
                    # write nothing.
                    continue
                if not dry_run:
                    CatalogEntry.objects.create(
                        cluster_id=cluster_id,
                        source=source,
                        source_id=str(canonical.get("sourceId", "")),
                        source_url=canonical.get("sourceUrl", ""),
                        title=str(canonical.get("title", ""))[:512],
                        languages=canonical.get("languages") or [],
                        tags=canonical.get("tags") or [],
                        difficulty_proxy=canonical.get("difficultyProxy") or {},
                        sample_fingerprint=canonical.get("sampleFingerprint", "")
                        or "",
                        license_status=effective,
                        archived=entry is not None,
                        imported_problem=problem,
                        attribution=str(canonical.get("attribution", ""))[:500],
                    )

                if options["limit"] and (
                    stats["imported"] + stats["metadata_only"]
                    >= options["limit"]
                ):
                    break

        self.stdout.write(
            self.style.SUCCESS(
                "import_catalog: {imported} imported, "
                "{pending_translation} pending translation, "
                "{metadata_only} metadata-only, "
                "{skipped_existing} already present".format(**stats)
            )
        )
