"""Export the imported problem catalog as a reproducible fixture.

The 2026-11 content waves imported ~1 850 problems through workspace
scripts that never landed in the repo: a fresh environment rebuilt only
the ~29-problem seed pack, and the workspace's translations.json lagged
the database ledger (~77 EN statements reconciled by hand afterwards).

This command closes the reproducibility gap the other way round: the
database becomes the source of truth and ships as a committed fixture.

`export_catalog` writes everything `import_catalog` needs to rebuild the
catalog on a fresh environment:

- problems with author usernames, i18n payloads (all locales), tags,
  limits, io mode, scoring config, provenance (source_url/authors),
  status and verifier;
- test cases (input/expected/points/sample/subtask/per-test bars);
- the import permission ledger (ImportSource rows — CNT-2);
- editorials + hints where present.

Output: one gzipped JSON per section under problems/data/catalog/.
Deterministic ordering (by source key then title then id) so repeated
exports diff cleanly. Import side: `import_catalog` (see its docstring).
"""

import gzip
import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db.models import Q

from problems.models import CurriculumNode, ImportSource, Problem, TestCase

OUT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "catalog"


class Command(BaseCommand):
    help = "Export the problem catalog to the committed reproducibility fixture."

    def add_arguments(self, parser):
        parser.add_argument(
            "--imported-only",
            action="store_true",
            help=(
                "Export only rows with import provenance (source_url or "
                "import_source); the seed pack and hand-authored problems "
                "rebuild from seed_problems + specs instead."
            ),
        )
        parser.add_argument(
            "--out",
            default=str(OUT_DIR),
            help="Output directory (default: problems/data/catalog).",
        )

    def handle(self, *args, **options):
        out = Path(options["out"])
        out.mkdir(parents=True, exist_ok=True)
        qs = Problem.objects.all().order_by("id")
        if options["imported_only"]:
            qs = qs.filter(Q(source_url__isnull=False) & ~Q(source_url=""))
        problems = []
        for problem in qs:
            problems.append(
                {
                    "key": problem.source_url or f"wc:{problem.id}",
                    "title_i18n": problem.title_i18n,
                    "statement_i18n": problem.statement_i18n,
                    "hints_ro": problem.hints_ro,
                    "hints_en": problem.hints_en,
                    "status": problem.status,
                    "difficulty": problem.difficulty,
                    "problem_type": problem.problem_type,
                    "scoring_mode": problem.scoring_mode,
                    "comparison_mode": problem.comparison_mode,
                    "io_mode": problem.io_mode,
                    "io_input_filename": problem.io_input_filename,
                    "io_output_filename": problem.io_output_filename,
                    "default_time_limit_ms": problem.default_time_limit_ms,
                    "default_memory_limit_kb": problem.default_memory_limit_kb,
                    "limit_overrides": problem.limit_overrides,
                    "allowed_languages": problem.allowed_languages,
                    "source_url": problem.source_url,
                    "source_name": problem.source_name,
                    "source_authors": problem.source_authors,
                    "alt_sources": problem.alt_sources,
                    "source_contest": problem.source_contest,
                    "source_year": problem.source_year,
                    "grade_group": problem.grade_group,
                    "difficulty_source": problem.difficulty_source,
                    "author": problem.author.username,
                    "verifier": problem.verifier.username if problem.verifier else None,
                    "verifier_feedback": problem.verifier_feedback,
                    "reference_solution_code": problem.reference_solution_code,
                    "reference_language": problem.reference_language,
                    "tags": sorted(problem.tags.values_list("slug", flat=True)),
                    "curriculum": sorted(
                        problem.curriculum_nodes.values_list("slug", flat=True)
                    ),
                    "tests": [
                        {
                            "input_data": tc.input_data,
                            "expected_output_data": tc.expected_output_data,
                            "is_sample": tc.is_sample,
                            "points": tc.points,
                            "subtask": tc.subtask,
                            "time_limit_ms": tc.time_limit_ms,
                        }
                        for tc in problem.test_cases.all().order_by("id")
                    ],
                }
            )
        sources = [
            {
                "name": s.name,
                "contact": s.contact,
                "terms": s.terms,
                "granted_at": s.granted_at.isoformat() if s.granted_at else None,
                "evidence_url": s.evidence_url,
                "status": s.status,
                "notes": s.notes,
            }
            for s in ImportSource.objects.all().order_by("name")
        ]
        curriculum = [
            {
                "slug": n.slug,
                "parent": n.parent.slug if n.parent else None,
                "kind": n.kind,
                "name_i18n": n.name_i18n,
                "order": n.order,
            }
            for n in CurriculumNode.objects.all().order_by("slug")
        ]
        self._write(out / "problems.json.gz", {"problems": problems})
        self._write(out / "sources.json.gz", {"sources": sources})
        self._write(out / "curriculum.json.gz", {"nodes": curriculum})
        tests = sum(len(p["tests"]) for p in problems)
        self.stdout.write(
            self.style.SUCCESS(
                f"exported {len(problems)} problems ({tests} tests), "
                f"{len(sources)} import sources, {len(curriculum)} curriculum nodes -> {out}"
            )
        )

    def _write(self, path, payload):
        with gzip.open(path, "wt", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, sort_keys=True)
