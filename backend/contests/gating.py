"""Submission gating for contests (CON-1: "registered + window open").

Imported by ``submissions.serializers`` — kept free of any submissions-app
import so the dependency stays one-directional (submissions → contests).
"""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import Contest, ContestParticipation, ContestProblem

#: In-contest per-user submission cooldown (round-2 OPR-4: 30–60s
#: anti-brute-force pacing). Env-overridable; tests shrink it via
#: override_settings.
DEFAULT_CONTEST_COOLDOWN_SECONDS = 30


def contest_cooldown_seconds() -> int:
    return int(
        getattr(
            settings,
            "CONTEST_SUBMIT_COOLDOWN_SECONDS",
            DEFAULT_CONTEST_COOLDOWN_SECONDS,
        )
    )


def check_contest_submission(
    contest: Contest, user, problem_id: int, now=None
) -> tuple[bool, str]:
    """Validate a contest-bound submission at create time.

    Returns (ok, error). Rules:
    - the problem must be on the contest's board;
    - the user must be registered (and not disqualified);
    - for windowed contests the personal clock must be running
      (``virtual_start`` set and inside the personal window);
    - the submission must land inside the caller's effective window;
    - the per-user cooldown between in-contest submissions must have elapsed.

    End-of-contest upsolving intentionally falls out of this path: the
    contest-bound submit is rejected after ``end_at`` and the user submits
    from the ordinary problem page instead (CON-5 archive behaviour).
    """
    now = now or timezone.now()
    if not ContestProblem.objects.filter(
        contest=contest, problem_id=problem_id
    ).exists():
        return False, "This problem is not part of the contest."
    participation = ContestParticipation.for_submission(contest, user.id, now)
    if participation is None:
        return False, "You are not registered for this contest."
    if participation.is_disqualified:
        return False, "Your participation was disqualified."
    if participation.is_virtual:
        # CON-5 virtual replay: the contest itself is over; only the
        # personal replay window governs (cooldown still applies below).
        if participation.virtual_start is None or not participation.window_open(now):
            return False, "Your virtual contest clock is not running."
        return _cooldown_ok(contest, user, now)
    if contest.state(now) == Contest.State.UPCOMING:
        return False, "The contest has not started yet."
    if contest.state(now) == Contest.State.FINISHED:
        return False, (
            "The contest has ended — submit from the problem page to keep practicing."
        )
    if contest.is_window and participation.virtual_start is None:
        return False, "Start your personal contest clock before submitting."
    if not participation.window_open(now):
        return False, "Your contest window is not open."
    return _cooldown_ok(contest, user, now)


def _cooldown_ok(contest, user, now) -> tuple[bool, str]:
    """OPR-4 in-contest cooldown, shared by live and virtual sittings."""
    cooldown = contest_cooldown_seconds()
    if cooldown <= 0:
        return True, ""
    from submissions.models import Submission  # local: keep module import acyclic

    boundary = now - timedelta(seconds=cooldown)
    recent = Submission.objects.filter(
        user=user, contest=contest, submission_time__gte=boundary
    ).exists()
    if recent:
        return False, (
            f"Contest submissions are rate-limited — try again in {cooldown}s."
        )
    return True, ""


def practice_blocked_reason(problem, user, now=None) -> str | None:
    """CON-5 archive gate for PRACTICE submissions (contest=None).

    While a problem sits on a contest that has not yet reverted to practice
    — still upcoming/running, or inside its editorial delay — the problem
    page refuses new submissions: the contest path owns it (otherwise the
    live board leaks through practice). Admins, the problem's author and
    its verifier bypass; after ``upsolving_free_at`` everyone practices
    freely (upsolving).
    """
    now = now or timezone.now()
    user_is_admin = bool(
        user
        and getattr(user, "is_authenticated", False)
        and (user.is_staff or getattr(user, "role", "") == "ADMIN")
    )
    if user_is_admin or problem.author_id == getattr(user, "id", None):
        return None
    if getattr(user, "is_authenticated", False) and hasattr(user, "id"):
        if problem.verifier_id == user.id:
            return None
    qs = ContestProblem.objects.filter(problem_id=problem.id).select_related("contest")
    for cp in qs:
        if cp.contest.upsolving_free_at() > now:
            return (
                "This problem belongs to an upcoming, running or just-finished "
                "contest — it opens for practice once the contest fully ends."
            )
    return None
