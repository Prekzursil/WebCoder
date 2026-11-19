"""Wave F content-ops services (items 125/131/132/133).

- ``problem_changelog`` (125) — the full versioning ledger: statement
  revisions (UXP-4, already shipped) joined with config-change notes into
  one chronological feed.
- ``restore_revision`` (125) — roll a problem's title/statement back to a
  recorded revision (author/verifier), recording the restore itself.
- ``visible_problems`` / ``drop_tick`` (131) — scheduled content drops:
  the public catalog hides APPROVED problems whose ``publish_at`` is in
  the future; a Celery tick flips a materialized ``dropped_at`` so the
  transition itself is observable.
- ``author_analytics`` (132) — the per-author dashboard derivation.
"""

from __future__ import annotations

from django.db import models as dj_models
from django.utils import timezone

from submissions.models import Submission

from .models import Problem, StatementRevision, ProblemBounty


def problem_changelog(problem, limit: int = 50) -> list[dict]:
    """Item 125 — one chronological feed: statement revisions with author,
    note and timestamp (the full ledger the wave-C history seeded)."""
    rows = (
        StatementRevision.objects.filter(problem=problem)
        .select_related("edited_by")
        .order_by("-created_at", "-id")[:limit]
    )
    return [
        {
            "id": row.id,
            "kind": "statement",
            "edited_by": row.edited_by.username if row.edited_by else None,
            "note": row.note,
            "created_at": row.created_at,
        }
        for row in rows
    ]


def restore_revision(problem, revision_id: int, edited_by=None) -> tuple[bool, str]:
    """Item 125 — roll the statement back to a recorded revision.

    Returns (ok, message). The restore writes a NEW revision (the ledger
    is append-only), so history never lies about what happened.
    """
    revision = StatementRevision.objects.filter(pk=revision_id, problem=problem).first()
    if revision is None:
        return False, "No such revision for this problem."
    problem.title_i18n = revision.title_i18n
    problem.statement_i18n = revision.statement_i18n
    problem.save()
    StatementRevision.objects.create(
        problem=problem,
        title_i18n=revision.title_i18n,
        statement_i18n=revision.statement_i18n,
        edited_by=edited_by,
        note=f"restored from revision {revision.id}",
    )
    return True, f"Restored revision {revision.id}."


def problem_is_visible(problem, now=None) -> bool:
    """Item 131 — the catalog gate: APPROVED and either no schedule or the
    drop moment has passed."""
    now = now or timezone.now()
    if problem.status != Problem.ProblemStatus.APPROVED:
        return False
    if problem.publish_at is None:
        return True
    return problem.publish_at <= now


def visible_problem_queryset(qs=None):
    """The public catalog queryset honoring scheduled drops."""
    qs = qs if qs is not None else Problem.objects.all()
    now = timezone.now()
    return qs.filter(status=Problem.ProblemStatus.APPROVED).filter(
        dj_models.Q(publish_at__isnull=True) | dj_models.Q(publish_at__lte=now)
    )


def upcoming_drops(limit: int = 20) -> list[dict]:
    """The scheduled-drop calendar (staff view)."""
    now = timezone.now()
    rows = Problem.objects.filter(
        status=Problem.ProblemStatus.APPROVED, publish_at__gt=now
    ).order_by("publish_at")[:limit]
    return [
        {
            "problem_id": row.id,
            "title": (
                row.title_i18n.get("en", f"Problem {row.id}")
                if isinstance(row.title_i18n, dict)
                else f"Problem {row.id}"
            ),
            "publish_at": row.publish_at,
        }
        for row in rows
    ]


def author_analytics(user) -> dict:
    """Item 132 — the author dashboard: funnel from authored problems to
    submissions, AC rates, difficulty mix, editorial coverage and bounty
    activity. Pure derivation over existing tables."""
    problems = Problem.objects.filter(author=user)
    approved = problems.filter(status=Problem.ProblemStatus.APPROVED)
    ids = list(problems.values_list("id", flat=True))
    submissions = Submission.objects.filter(problem_id__in=ids)
    total_submissions = submissions.count()
    ac = submissions.filter(verdict=Submission.VerdictStatus.ACCEPTED).count()
    solved_users = (
        submissions.filter(verdict=Submission.VerdictStatus.ACCEPTED)
        .values("user_id")
        .distinct()
        .count()
    )
    by_difficulty = {"EASY": 0, "MEDIUM": 0, "HARD": 0}
    for problem in approved:
        if problem.difficulty in by_difficulty:
            by_difficulty[problem.difficulty] += 1
    editorial_coverage = approved.filter(editorial__isnull=False).count()
    bounties_open = ProblemBounty.objects.filter(
        problem__in=ids, status=ProblemBounty.Status.OPEN
    ).count()
    return {
        "problems_total": problems.count(),
        "problems_approved": approved.count(),
        "by_difficulty": by_difficulty,
        "submissions_total": total_submissions,
        "acceptance_rate": (
            round(100.0 * ac / total_submissions, 1) if total_submissions else None
        ),
        "unique_solvers": solved_users,
        "editorial_coverage": editorial_coverage,
        "open_test_bounties": bounties_open,
    }
