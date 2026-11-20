"""Remove ad-hoc/e2e fixture pollution from the problem catalog.

The 2026-11-20 polish sweep found 50+ rows on the live stack that were
never real content:

- real-mode Playwright seed pairs ("Two Sum" / "Reverse String" / "E2E
  Blockly Real Last Digit") — the e2e helper's page-1 lookup stopped
  finding earlier seeds once the catalog passed 100 problems, so every
  run re-created the pair and teardown deleted only one (fixed in
  e2e/lib/realStack.ts the same sweep; this command removes the backlog);
- one-shot probe problems created by ad-hoc live scripts during the
  judge-fairness and i18n waves ("Proof A tight (no multiplier)",
  "JFW-A multiplier proof (pinned 100ms)", "Live Proof", "Sum of Two").

Every deleted row is a fixture title that either carries no testcases or
sits in DRAFT/PENDING, and — when it has submissions at all — only
submissions from the e2e fixture account. Dry-run by default; pass
--apply to delete.
"""

from django.core.management.base import BaseCommand
from django.db.models import Count, Q

from problems.models import Problem
from submissions.models import Submission

#: Exact English titles owned by e2e seeding / ad-hoc probe scripts.
#: Split by shape: PROBE_TITLES are unmistakable artifacts (no real author
#: titles a problem "Proof A tight (no multiplier)") and are removed
#: regardless of status; PLAUSIBLE_TITLES could name legitimate content
#: someday, so those rows only match when they look like fixtures (no
#: testcases, or DRAFT/PENDING).
PROBE_TITLES = (
    "E2E Blockly Real Last Digit",
    "Proof A tight (no multiplier)",
    "Proof A fair (3x multiplier)",
    "JFW-A multiplier proof (pinned 100ms)",
    "Live Proof",
    "Sum (C and Node)",
)

#: Live-verification probes whose titles carry a timestamp suffix.
PROBE_TITLE_PREFIXES = ("A+B Sum (live verify",)

PLAUSIBLE_TITLES = (
    "Two Sum",
    "Reverse String",
    "Sum of Two",
)

FIXTURE_TITLES = PROBE_TITLES + PLAUSIBLE_TITLES


def fixture_queryset():
    """Problems whose EN title marks them as e2e/ad-hoc fixtures."""
    probes = Problem.objects.filter(title_i18n__en__in=PROBE_TITLES).annotate(
        testcase_count=Count("test_cases")
    )
    for prefix in PROBE_TITLE_PREFIXES:
        probes = probes | Problem.objects.filter(
            title_i18n__en__startswith=prefix
        ).annotate(testcase_count=Count("test_cases"))
    plausible = (
        Problem.objects.filter(title_i18n__en__in=PLAUSIBLE_TITLES)
        .annotate(testcase_count=Count("test_cases"))
        .filter(
            Q(testcase_count=0)
            | Q(
                status__in=[
                    Problem.ProblemStatus.DRAFT,
                    Problem.ProblemStatus.PENDING_APPROVAL,
                ]
            )
        )
    )
    return probes | plausible


class Command(BaseCommand):
    help = (
        "Delete e2e/ad-hoc fixture problems left in the catalog by real-mode "
        "runs and probe scripts (dry-run by default; --apply to delete)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually delete the rows (default: report only).",
        )
        parser.add_argument(
            "--allow-submissions",
            action="store_true",
            help=(
                "Also delete fixture-titled rows that carry submissions, but "
                "only when every submission belongs to the e2e_tester account."
            ),
        )

    def handle(self, *args, **options):
        rows = list(fixture_queryset().order_by("id"))
        deleted = skipped = 0
        for problem in rows:
            is_probe = problem.title_i18n.get("en") in PROBE_TITLES
            allowed_submitters = ["e2e_tester", "admin", "bob"] if is_probe else ["e2e_tester"]
            stranger_subs = Submission.objects.filter(problem=problem).exclude(
                user__username__in=allowed_submitters
            ).exclude(user__username__startswith="replay_")
            if stranger_subs.exists():
                self.stdout.write(
                    f"KEEP {problem.pk} '{problem.title_i18n.get('en', '')}' "
                    "(has non-probe submissions)"
                )
                skipped += 1
                continue
            has_subs = Submission.objects.filter(problem=problem).exists()
            if has_subs and not options["allow_submissions"]:
                self.stdout.write(
                    f"skip {problem.pk} '{problem.title_i18n.get('en', '')}' "
                    "(probe submissions present; rerun with --allow-submissions)"
                )
                skipped += 1
                continue
            action = "deleted" if options["apply"] else "would delete"
            self.stdout.write(f"{action}: {problem.pk} '{problem.title_i18n.get('en', '')}'")
            if options["apply"]:
                problem.delete()
                deleted += 1
        suffix = " (dry-run)" if not options["apply"] else ""
        self.stdout.write(
            self.style.SUCCESS(f"{deleted} deleted, {skipped} skipped{suffix}")
        )
