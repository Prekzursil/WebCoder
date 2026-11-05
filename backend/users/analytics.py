"""Owner product analytics (competitive roadmap round-2 ANA-1).

Server-side derivations over existing models only — signup → first
submission → first-AC activation, D1/D7 activity, submission funnel —
self-hosted and cookie-light by construction (nothing is collected beyond
what the product already stores). Powers the weekly owner dashboard and
the per-wave exit metrics; must precede Wave B/C/D sequencing decisions.
"""

from datetime import timedelta

from django.db.models import Count, Min
from django.utils import timezone

from submissions.models import Submission

from .models import OwnerWeeklySnapshot, User


def _first_submission_times():
    return {
        row["id"]: row["first_sub"]
        for row in User.objects.annotate(
            first_sub=Min("submissions__submission_time")
        ).values("id", "first_sub")
        if row["first_sub"] is not None
    }


def activation_snapshot() -> dict:
    """Funnel + retention counts for the owner dashboard."""
    total_users = User.objects.filter(is_active=True).count()
    first_subs = _first_submission_times()
    users_with_submission = len(first_subs)

    first_ac = {
        row["user_id"]: row["first_ac"]
        for row in Submission.objects.filter(verdict=Submission.VerdictStatus.ACCEPTED)
        .values("user_id")
        .annotate(first_ac=Min("submission_time"))
        if row["first_ac"] is not None
    }
    users_with_ac = len(first_ac)

    # D1/D7: a user is "active on day N" if their first submission landed
    # within N days of signup (the cheap, honest proxy available from
    # existing rows — session-level retention would need new tracking,
    # which the cookie-light constraint rules out v1).
    d1 = d7 = 0
    for user in User.objects.filter(is_active=True).only("id", "date_joined"):
        first = first_subs.get(user.id)
        if first is None:
            continue
        delta_days = (first.date() - user.date_joined.date()).days
        if 0 <= delta_days <= 1:
            d1 += 1
        if 0 <= delta_days <= 7:
            d7 += 1

    since = timezone.now().date() - timedelta(days=30)
    per_day = {
        row["submission_time__date"].isoformat(): row["n"]
        for row in (
            Submission.objects.filter(submission_time__date__gte=since)
            .values("submission_time__date")
            .annotate(n=Count("id"))
            .order_by("submission_time__date")
        )
    }

    def rate(numerator):
        return round(numerator / total_users, 4) if total_users else None

    return {
        "total_users": total_users,
        "users_with_submission": users_with_submission,
        "users_with_ac": users_with_ac,
        "activation_rate": rate(users_with_submission),
        "first_ac_rate": rate(users_with_ac),
        "d1_active": d1,
        "d7_active": d7,
        "d1_rate": rate(d1),
        "d7_rate": rate(d7),
        "submissions_per_day_30d": per_day,
        "total_submissions": Submission.objects.count(),
    }


def iso_week_key(at=None) -> str:
    """The ISO year-week key (``YYYY-Www``) for a moment in time."""
    from datetime import datetime, timezone as dt_timezone

    moment = at or datetime.now(dt_timezone.utc)
    year, week, _day = moment.isocalendar()
    return f"{year}-W{week:02d}"


def capture_weekly_snapshot(at=None) -> "OwnerWeeklySnapshot":
    """Freeze this week's activation derivations into one row.

    Idempotent per week: re-running the same week overwrites the payload
    (backfills and manual re-captures converge to the latest view).
    """
    from .models import OwnerWeeklySnapshot

    snapshot, _created = OwnerWeeklySnapshot.objects.update_or_create(
        week=iso_week_key(at),
        defaults={"payload": activation_snapshot()},
    )
    return snapshot


def weekly_history(weeks: int = 12) -> list[dict]:
    """The most recent *weeks* snapshots, oldest first, for the trend
    strip on the owner dashboard (the live current-week numbers come from
    ``activation_snapshot()`` directly)."""
    from .models import OwnerWeeklySnapshot

    rows = OwnerWeeklySnapshot.objects.order_by("-week")[: max(1, weeks)]
    return [
        {"week": row.week, "captured_at": row.captured_at, **row.payload}
        for row in reversed(rows)
    ]
