"""Verdict-commit materialization for contest standings (round-2 PRF-1).

``record_verdict`` folds one judged contest submission into its
``ContestScore`` row inside the same transaction that saves the terminal
verdict, keeping both the live and freeze-filtered aggregates current —
scoreboard reads are pure selects over these rows (``views.standings``).
"""

import logging

from celery import shared_task
from django.db import transaction

from submissions.models import Submission

from .models import ContestParticipation, ContestProblem, ContestScore

logger = logging.getLogger(__name__)


def _fold(row: ContestScore, *, score: float, points_max: int, at, verdict: str):
    """Fold one submission outcome into one aggregate variant (live helper).

    Called twice per verdict — once for the live columns, once for the
    frozen columns when the submission predates the freeze boundary.
    """
    row.attempts += 1
    if score > row.best_score:
        row.best_score = score
        row.last_improvement = at
    if points_max > 0 and score >= points_max and row.first_ac_at is None:
        row.first_ac_at = at
    # ICPC/AtCoder penalty input: wrong (non-CE) submissions that had not
    # yet achieved the full solve (partial credit below the max still reads
    # as "not solved"). CE is DOMjudge-style free.
    if (
        row.first_ac_at is None
        and score < points_max
        and verdict != Submission.VerdictStatus.COMPILE_ERROR
    ):
        row.wrong_before_ac += 1


def record_verdict(submission: Submission) -> ContestScore | None:
    """Update the (participation, problem) standings row for a verdict.

    No-op (returns None) for practice submissions, non-member problems,
    missing participations, and submissions outside the participation's
    window (defensive: the create-gate already rejects those).
    """
    contest = submission.contest
    if contest is None:
        return None
    cp = ContestProblem.objects.filter(
        contest=contest, problem_id=submission.problem_id
    ).first()
    if cp is None:
        return None
    participation = ContestParticipation.objects.filter(
        contest=contest, user_id=submission.user_id
    ).first()
    if participation is None:
        return None
    if submission.submission_time < participation.effective_start():
        return None

    score = float(submission.score or 0)
    at = submission.submission_time
    frozen_view = (
        contest.freeze_at is not None and at <= contest.freeze_at
    )

    with transaction.atomic():
        row, _created = ContestScore.objects.select_for_update().get_or_create(
            participation=participation, contest_problem=cp
        )
        # Live aggregates always update.
        _fold(row, score=score, points_max=cp.points, at=at, verdict=submission.verdict)
        if frozen_view:
            # Mirror onto the freeze-filtered columns.
            row.attempts_frozen += 1
            if score > row.best_score_frozen:
                row.best_score_frozen = score
                row.last_improvement_frozen = at
            if (
                cp.points > 0
                and score >= cp.points
                and row.first_ac_at_frozen is None
            ):
                row.first_ac_at_frozen = at
            if (
                row.first_ac_at_frozen is None
                and score < cp.points
                and submission.verdict != Submission.VerdictStatus.COMPILE_ERROR
            ):
                row.wrong_before_ac_frozen += 1
        row.save()
    return row


@shared_task
def record_verdict_task(submission_id: int):
    """Celery wrapper: dispatch on verdict commit (tasks.py hook)."""
    submission = (
        Submission.objects.select_related("contest", "problem")
        .filter(pk=submission_id, contest__isnull=False)
        .first()
    )
    if submission is None:
        return f"submission {submission_id} not contest-bound"
    row = record_verdict(submission)
    return f"score row {'updated' if row else 'skipped'} for submission {submission_id}"
