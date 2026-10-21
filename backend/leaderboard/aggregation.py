"""Leaderboard aggregation (SPEC-GAPS D-B8).

Recompute of every user's LeaderboardEntry from submissions — single SQL
pass for the full recompute, no N+1. Scoring rule (Codeforces-lite):

- a solve = ``Submission.verdict == AC`` on a Problem with
  ``status == APPROVED``;
- points credited once per (user, problem): the sum of that problem's
  TestCase.points (default 10 each);
- partial ``Submission.score`` is ignored for the leaderboard;
- submission totals (for the success-rate column) count all submissions
  by the user to APPROVED problems.
"""

from celery import shared_task
from django.db import transaction
from django.db.models import (
    Count,
    Min,
    OuterRef,
    Q,
    Subquery,
    Sum,
)

from problems.models import Problem, TestCase
from submissions.models import Submission

from .models import LeaderboardEntry

_AC = Q(verdict=Submission.VerdictStatus.ACCEPTED)
_APPROVED = Q(problem__status=Problem.ProblemStatus.APPROVED)


def _problem_points_subquery():
    return Subquery(
        TestCase.objects.filter(problem=OuterRef("problem"))
        .values("problem")
        .annotate(p=Sum("points"))
        .values("p")
    )


def _user_totals(user_id=None):
    """Per-user (total, ac) submission counts over APPROVED problems."""
    qs = Submission.objects.filter(_APPROVED).values("user_id")
    if user_id is not None:
        qs = qs.filter(user_id=user_id)
    return {
        row["user_id"]: (row["total"], row["ac"])
        for row in qs.annotate(
            total=Count("id"), ac=Count("id", filter=_AC)
        )
    }


def update_user_entry(user_id):
    """Recompute one user's row (idempotent; safe to call repeatedly).

    Called incrementally after each terminal AC verdict (dispatched from
    submissions/tasks.py via transaction.on_commit) and reused by the
    full recompute.
    """
    solves = (
        Submission.objects.filter(_AC, _APPROVED, user_id=user_id)
        .values("problem_id")
        .annotate(
            first_ac=Min("submission_time"),
            points=_problem_points_subquery(),
        )
    )
    solved_count = 0
    total_points = 0
    last_solved_at = None
    for row in solves:
        solved_count += 1
        total_points += int(row["points"] or 0)
        first_ac = row["first_ac"]
        if last_solved_at is None or first_ac > last_solved_at:
            last_solved_at = first_ac

    totals = _user_totals(user_id).get(user_id, (0, 0))

    entry, _ = LeaderboardEntry.objects.update_or_create(
        user_id=user_id,
        defaults={
            "solved_count": solved_count,
            "total_points": total_points,
            "total_submissions": totals[0],
            "ac_submissions": totals[1],
            "last_solved_at": last_solved_at,
        },
    )
    return entry


def recompute_all_leaderboards():
    """Full pass: upsert every active user, delete stale entries.

    One SQL query over the per-(user, problem) solves — deduped by the
    GROUP BY, so the per-user reduction in Python credits each problem
    exactly once. (The D-B8 design sketched chained annotate(Sum/Max) over
    the grouped solves; Django raises ``Cannot compute Max('first_ac'):
    'first_ac' is an aggregate`` for aggregate-over-aggregate, so the
    reduction happens in Python over the same single query — still no N+1.)
    """
    solves = (
        Submission.objects.filter(_AC, _APPROVED)
        .values("user_id", "problem_id")
        .annotate(
            first_ac=Min("submission_time"),
            points=_problem_points_subquery(),
        )
    )
    per_user: dict[int, dict] = {}
    for row in solves:
        acc = per_user.setdefault(
            row["user_id"],
            {"solved_count": 0, "total_points": 0, "last_solved_at": None},
        )
        acc["solved_count"] += 1
        acc["total_points"] += int(row["points"] or 0)
        first_ac = row["first_ac"]
        if acc["last_solved_at"] is None or first_ac > acc["last_solved_at"]:
            acc["last_solved_at"] = first_ac

    totals = _user_totals()

    with transaction.atomic():
        for user_id, acc in per_user.items():
            total, ac = totals.get(user_id, (0, 0))
            LeaderboardEntry.objects.update_or_create(
                user_id=user_id,
                defaults={
                    **acc,
                    "total_submissions": total,
                    "ac_submissions": ac,
                },
            )
        LeaderboardEntry.objects.exclude(user_id__in=per_user.keys()).delete()
    return len(per_user)


@shared_task
def update_user_entry_task(user_id):
    """Celery wrapper for the incremental post-AC recompute."""
    return update_user_entry(user_id)


@shared_task
def recompute_all_leaderboards_task():
    """Celery wrapper for the (future beat-scheduled) nightly full pass.

    Beat wiring itself is D-B11 and not part of this wave.
    """
    return recompute_all_leaderboards()
