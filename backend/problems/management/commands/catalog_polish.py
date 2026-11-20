"""Apply the 2026-11-20 catalog translation/hygiene polish payload.

Reads ``problems/data/catalog_polish.json`` (committed next to this
command) and, in order:

1. deduplicates exact-title rows (translation experiments left copies —
   e.g. "注文の多い順列" ×3, "Simple AplusB" ×2), keeping the lowest id;
2. applies per-locale title overrides for the yukicoder imports whose
   machine translation kept Japanese titles in every locale;
3. applies per-locale statement substring patches (Japanese fragments
   left inside translated statements) and drops broken minor-locale
   statements so the EN fallback (owner rule (d)) serves them;
4. fills in hand-written Romanian statements for rows the import left
   without one (Sumdiv, SumaPătrate, Bookworm, Road Reparation).

Matching is by exact current English title (pre-fix), so the command is
idempotent: after titles are replaced the second run finds no rows and
reports zero changes. Dry-run by default; ``--apply`` writes.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import connection, transaction

from problems.models import Problem

DATA_FILE = (
    Path(__file__).resolve().parent.parent.parent / "data" / "catalog_polish.json"
)


def detach_catalog_entries(problem_id):
    """Null the import-ledger FK before deleting an imported problem.

    ``problems_catalogentry`` is a raw table the content-import pipeline
    created outside the ORM (no Django model); its ``imported_problem_id``
    would otherwise block the delete. No-op when the table is absent
    (fresh CI databases never had the import pipeline).
    """
    with connection.cursor() as cursor:
        try:
            cursor.execute(
                "UPDATE problems_catalogentry SET imported_problem_id = NULL "
                "WHERE imported_problem_id = %s",
                [problem_id],
            )
        except Exception:
            # Fresh databases (sqlite CI, new deploys) never had the
            # import pipeline — the table simply is not there.
            pass


def load_payload():
    with open(DATA_FILE, encoding="utf-8") as fh:
        return json.load(fh)


def find_by_title(title):
    return Problem.objects.filter(title_i18n__en=title).order_by("id")


class Command(BaseCommand):
    help = "Apply the catalog translation/hygiene polish payload (dry-run by default)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Write the changes (default: report only).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        apply = options["apply"]
        payload = load_payload()
        report = {
            "deduped": 0,
            "titled": 0,
            "patched": 0,
            "dropped_locales": 0,
            "ro_filled": 0,
        }

        for title in payload.get("drop_pending_dupes", []):
            approved = Problem.objects.filter(
                title_i18n__en=title, status=Problem.ProblemStatus.APPROVED
            )
            if not approved.exists():
                self.stdout.write(f"no APPROVED '{title}' to keep; dupe drop skipped")
                continue
            for dupe in Problem.objects.filter(
                title_i18n__en=title, status=Problem.ProblemStatus.PENDING_APPROVAL
            ):
                self._report(
                    apply,
                    f"drop pending dupe {dupe.pk} '{title}'",
                    lambda problem=dupe: _delete_problem(problem),
                )
                report["deduped"] += 1

        for title in payload.get("dedupe_titles", []):
            rows = list(find_by_title(title))
            for dupe in rows[1:]:
                self._report(
                    apply,
                    f"dedupe delete {dupe.pk} '{title}'",
                    lambda problem=dupe: _delete_problem(problem),
                )
                report["deduped"] += 1

        for fix in payload.get("fixes", []):
            rows = list(find_by_title(fix["match_title_en"]))
            if not rows:
                self.stdout.write(
                    f"no match for '{fix['match_title_en']}' (already polished?)"
                )
                continue
            for problem in rows:
                titles = dict(problem.title_i18n or {})
                titles.update(fix.get("titles", {}))
                self._report(
                    apply,
                    f"titles {problem.pk} '{fix['match_title_en']}' -> "
                    f"'{titles.get('en', '')}'",
                    lambda p=problem, t=titles: _save_titles(p, t),
                )
                report["titled"] += 1

                statement = dict(problem.statement_i18n or {})
                changed = False
                for locale, patches in (
                    fix.get("statement_replacements") or {}
                ).items():
                    text = statement.get(locale)
                    if text is None:
                        self.stdout.write(
                            f"  warn: no '{locale}' statement on {problem.pk}; patch skipped"
                        )
                        continue
                    for old, new in patches:
                        if old in text:
                            text = text.replace(old, new)
                            changed = True
                        else:
                            self.stdout.write(
                                f"  warn: patch anchor not found ({locale}) on {problem.pk}"
                            )
                    statement[locale] = text
                for locale in fix.get("drop_statement_locales", []):
                    if statement.pop(locale, None) is not None:
                        changed = True
                        report["dropped_locales"] += 1
                if changed:
                    self._report(
                        apply,
                        f"statement patches on {problem.pk}",
                        lambda p=problem, s=statement: _save_statement(p, s),
                    )
                    report["patched"] += 1

        for entry in payload.get("missing_ro", []):
            rows = list(find_by_title(entry["match_title_en"]))
            if not rows:
                self.stdout.write(
                    f"no match for '{entry['match_title_en']}' (already polished?)"
                )
                continue
            for problem in rows:
                statement = dict(problem.statement_i18n or {})
                if statement.get("ro", "").strip():
                    self.stdout.write(
                        f"  keep existing RO on {problem.pk} '{entry['match_title_en']}'"
                    )
                    continue
                statement["ro"] = entry["statement_ro"]
                titles = dict(problem.title_i18n or {})
                titles["ro"] = entry["title_ro"]
                self._report(
                    apply,
                    f"RO statement for {problem.pk} '{entry['match_title_en']}'",
                    lambda p=problem, s=statement, t=titles: _save_both(p, s, t),
                )
                report["ro_filled"] += 1

        suffix = "" if apply else " (dry-run)"
        self.stdout.write(
            self.style.SUCCESS(
                "polish: {deduped} deduped, {titled} retitled, {patched} statements "
                "patched, {dropped_locales} broken locales dropped, {ro_filled} RO "
                "statements filled{suffix}".format(suffix=suffix, **report)
            )
        )

    def _report(self, apply, label, action):
        if apply:
            action()
        self.stdout.write(("applied: " if apply else "would apply: ") + label)


def _delete_problem(problem):
    detach_catalog_entries(problem.pk)
    problem.delete()


def _save_titles(problem, titles):
    problem.title_i18n = titles
    problem.save(update_fields=["title_i18n"])


def _save_statement(problem, statement):
    problem.statement_i18n = statement
    problem.save(update_fields=["statement_i18n"])


def _save_both(problem, statement, titles):
    problem.statement_i18n = statement
    problem.title_i18n = titles
    problem.save(update_fields=["statement_i18n", "title_i18n"])
