"""Per-user practice statistics and gamification derivations.

Competitive roadmap Wave A: B5 (statistics endpoint), RAT-4 (practice rank
ladder), RAT-5 (badges v1 — five, not thirty, per round-2 slice D.4),
RAT-6 (streaks with the anti-shame pairing: max streak + total active days,
weekly framing on the frontend).

Everything derives from existing rows (submissions × problems) in single
aggregation passes — no new write path, no event sourcing.
"""

from datetime import timedelta

from django.db.models import Count
from django.utils import timezone

from problems.models import Problem
from submissions.models import Submission

#: RAT-4 ladder weights per difficulty (contest-free practice rank).
LADDER_WEIGHTS = {
    # EDU-10: the beginner band credits like EASY — first-contact value
    # without inflating the ladder.
    Problem.DifficultyLevel.VERY_EASY: 1,
    Problem.DifficultyLevel.EASY: 1,
    Problem.DifficultyLevel.MEDIUM: 3,
    Problem.DifficultyLevel.HARD: 6,
}

#: Ladder thresholds are exponential: level n unlocks at
#: ``points_for_level(n) = 10 * (2 ** (n - 1) - 1)`` — L1=0, L2=10, L3=30,
#: L4=70, L5=150 … steep enough to mean something, cheap to compute.
LADDER_BASE = 10


def points_for_level(level: int) -> int:
    if level <= 1:
        return 0
    return LADDER_BASE * (2 ** (level - 1) - 1)


def level_for_points(points: int) -> int:
    level = 1
    while points_for_level(level + 1) <= points:
        level += 1
    return level


def ladder_state(points: int) -> dict:
    level = level_for_points(points)
    next_at = points_for_level(level + 1)
    prev_at = points_for_level(level)
    span = next_at - prev_at
    return {
        "points": points,
        "level": level,
        "next_level_points": next_at,
        "progress": (
            round((points - prev_at) / span, 4) if span > 0 else 1.0
        ),
    }


def _streaks(submission_dates):
    """(current_streak, max_streak, total_active_days) over a set of dates.

    ``current`` counts consecutive days ending today or yesterday (a streak
    survives until the day actually passes — no churn-shaming at midnight).
    """
    days = sorted(set(submission_dates))
    if not days:
        return 0, 0, 0
    total = len(days)
    max_streak = 1
    streak = 1
    for previous, current in zip(days, days[1:]):
        if (current - previous).days == 1:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 1
    today = timezone.now().date()
    if days[-1] in (today, today - timedelta(days=1)):
        current_streak = streak
    else:
        current_streak = 0
    return current_streak, max(max_streak, streak), total


def user_statistics(user) -> dict:
    """The full /users/me/statistics/ payload for one user."""
    # Submission.Meta.ordering (["-submission_time"]) leaks into
    # values().distinct(): Django appends the ordered column to the SELECT,
    # so DISTINCT stops deduping (same problem AC'd at two different
    # microsecond timestamps counts twice — found on the live stack).
    # .order_by() clears it before every distinct-aggregation here.
    subs = Submission.objects.filter(user=user).order_by()
    attempted = subs.values("problem_id").distinct().count()
    # One row per DISTINCT problem (a problem AC'd in several languages is
    # still one solve): (problem_id, problem__difficulty) are functionally
    # dependent, so this distinct is exactly the per-problem dedup.
    solved_rows = list(
        subs.filter(verdict=Submission.VerdictStatus.ACCEPTED)
        .values("problem_id", "problem__difficulty")
        .distinct()
    )
    solved = len(solved_rows)

    per_difficulty = {}
    for level_name in ("VERY_EASY", "EASY", "MEDIUM", "HARD"):
        per_difficulty[level_name] = {
            "solved": sum(
                1
                for row in solved_rows
                if row["problem__difficulty"] == level_name
            ),
            "attempted": subs.filter(problem__difficulty=level_name)
            .values("problem_id")
            .distinct()
            .count(),
        }

    per_language = {
        row["language"]: row["n"]
        for row in subs.values("language").order_by().annotate(n=Count("id"))
    }

    total_submissions = subs.count()
    acceptance_rate = (
        round(solved / attempted, 4) if attempted else None
    )

    heatmap_from = timezone.now().date() - timedelta(days=90)
    active_dates = sorted(
        set(
            subs.filter(submission_time__date__gte=heatmap_from).values_list(
                "submission_time__date", flat=True
            )
        )
    )
    current_streak, max_streak, total_active_days = _streaks(active_dates)

    ladder_points = sum(
        LADDER_WEIGHTS.get(row["problem__difficulty"], 1) for row in solved_rows
    )

    # Polyglot counts DISTINCT AC languages (a separate dimension from the
    # per-problem rows above).
    languages_with_ac = (
        subs.filter(verdict=Submission.VerdictStatus.ACCEPTED)
        .values("language")
        .distinct()
        .count()
    )  # subs is already .order_by()-cleared above
    badges = []
    if solved >= 1:
        badges.append("first_ac")
    if solved >= 10:
        badges.append("solved_10")
    if solved >= 50:
        badges.append("solved_50")
    if max_streak >= 7:
        badges.append("streak_7")
    if languages_with_ac >= 3:
        badges.append("polyglot_3")

    return {
        "solved": solved,
        "attempted": attempted,
        "total_submissions": total_submissions,
        "acceptance_rate": acceptance_rate,
        "per_difficulty": per_difficulty,
        "per_language": per_language,
        "active_dates_90d": [day.isoformat() for day in active_dates],
        "current_streak": current_streak,
        "max_streak": max_streak,
        "total_active_days": total_active_days,
        "ladder": ladder_state(ladder_points),
        "badges": badges,
    }
