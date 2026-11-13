"""Contest operational tasks (Wave B: CON-8 + round-2 OPR-4 + JDG-12).

- ``contest_tick`` (beat, every minute): finalize contests whose end_at has
  passed. Idempotent via ``Contest.finalized_at``.
- ``finalize_contest``: for pretest-mode contests, schedule the end-of-contest
  full-suite rejudge in SMALL STAGGERED BATCHES — the designed load spike
  round-2 OPR-4 demands be absorbed, never fired as one burst.
- ``rejudge_submissions_batch``: resets a batch of submissions to PENDING and
  re-dispatches judging on the judge-contest lane.
"""

import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from submissions.models import Submission

from .models import Contest

logger = logging.getLogger(__name__)

#: Rejudge dispatch granularity: submissions per scheduled batch.
REJUDGE_BATCH_SIZE = 5
#: Seconds between scheduled batches — spreads the end-of-contest rejudge
#: spike across minutes instead of queueing every job at once.
REJUDGE_STAGGER_SECONDS = 15


def finalize_contest(contest_id: int) -> str:
    """Run the end-of-contest pass for one contest (idempotent).

    Non-pretest contests need no re-execution (CodeChef's quick-rejudge
    lesson: their verdicts were already computed on the full suite — only
    the materialized standings stand). Pretest contests re-judge every
    contest submission on the FULL suite, staggered.
    """
    contest = Contest.objects.filter(pk=contest_id).first()
    if contest is None:
        return f"contest {contest_id} not found"
    if contest.finalized_at is not None:
        return f"contest {contest_id} already finalized"
    now = timezone.now()
    if contest.end_at > now:
        return f"contest {contest_id} not finished yet"

    with transaction.atomic():
        updated = Contest.objects.filter(
            pk=contest.pk, finalized_at__isnull=True
        ).update(finalized_at=now)
    if not updated:  # pragma: no cover - concurrent-finalizer guard
        return f"contest {contest_id} already finalized (race)"

    _schedule_ratings(contest)

    # CON-11: medals over the official standings (materialized rows only —
    # the staggered systest rejudge cannot race this read).
    from .awards import compute_contest_awards

    compute_contest_awards(contest)

    if not contest.pretest_mode:
        return f"contest {contest_id} finalized (no pretests to re-judge)"

    submission_ids = list(
        Submission.objects.filter(contest=contest)
        .order_by("id")
        .values_list("id", flat=True)
    )
    for index in range(0, len(submission_ids), REJUDGE_BATCH_SIZE):
        batch = submission_ids[index : index + REJUDGE_BATCH_SIZE]
        # Stagger: batch k starts at k * REJUDGE_STAGGER_SECONDS — bounded
        # ramp, contest lane stays dedicated (judge-contest queue).
        rejudge_submissions_batch.apply_async(
            args=[batch],
            countdown=(index // REJUDGE_BATCH_SIZE) * REJUDGE_STAGGER_SECONDS,
        )
    return (
        f"contest {contest_id} finalized; {len(submission_ids)} submissions re-judging"
    )


def _schedule_ratings(contest):
    """RAT-1: rated contests compute Glicko ratings once finalized. The
    ratings task runs after the (possibly staggered) full-suite rejudge is
    DISPATCHED — it consumes the final standings materialized rows, which
    update as verdicts land; for pretest contests the organizer typically
    re-rolls ratings via the rollback/recompute action after systests fully
    drain (see services.compute_contest_ratings idempotency)."""
    if not contest.is_rated:
        return
    from ratings.services import compute_contest_ratings_task

    compute_contest_ratings_task.delay(contest.pk)


@shared_task
def rejudge_submissions_batch(submission_ids):
    """Reset a batch to PENDING and dispatch judging (contest lane).

    Per-test outcomes from the first execution are replaced (the pretest
    rows are deleted); verdict history stays on the submission row itself.
    """
    from submissions.tasks import judge_submission_task  # local: avoid cycle

    reset = 0
    reset_ids = []
    with transaction.atomic():
        for submission_id in submission_ids:
            submission = (
                Submission.objects.select_for_update().filter(pk=submission_id).first()
            )
            if submission is None:
                continue
            submission.test_results.all().delete()
            submission.verdict = Submission.VerdictStatus.PENDING
            submission.score = None
            submission.detailed_feedback = "Rejudging on the full test suite…"
            submission.save(update_fields=["verdict", "score", "detailed_feedback"])
            reset += 1
            reset_ids.append(submission_id)
    for submission_id in reset_ids:
        judge_submission_task.apply_async(args=[submission_id], queue="judge-contest")
    return f"rejudged {reset} submissions"


@shared_task
def finalize_contest_task(contest_id: int):
    return finalize_contest(contest_id)


@shared_task
def contest_tick():
    """Beat task (every minute): finalize every contest that just ended."""
    now = timezone.now()
    due = Contest.objects.filter(finalized_at__isnull=True, end_at__lte=now)
    results = []
    for contest in due:
        results.append(finalize_contest(contest.pk))
    return "; ".join(results) or "no contests due"
