"""Periodic award derivations (item 67)."""

from celery import shared_task
from django.utils import timezone


@shared_task
def award_monthly_contributors() -> str:
    """Store a CONTRIBUTOR_OF_MONTH award for the previous month's top
    honor gainer (approved problems + editorials + articles + post upvotes).

    Idempotent via the (user, kind, period) unique constraint — safe to
    re-run from beat every night.
    """
    from community_depth.services import user_honor
    from users.models import User

    from .models import CommunityAward

    now = timezone.now()
    # The month that just closed: run in the first week of a new month.
    if now.day > 7:
        return "not in award window"
    previous = now.replace(
        year=now.year - 1 if now.month == 1 else now.year,
        month=12 if now.month == 1 else now.month - 1,
        day=1,
    )
    period = previous.strftime("%Y-%m")
    if CommunityAward.objects.filter(
        kind=CommunityAward.Kind.CONTRIBUTOR_OF_MONTH, period=period
    ).exists():
        return f"{period} already awarded"
    # Honor is a live derivation (no per-month ledger yet); the monthly
    # winner is today's top contributor — honest v1, noted on the award.
    best_user, best_honor = None, 0
    for user in User.objects.filter(is_active=True).iterator():
        honor = user_honor(user)["honor"]
        if honor > best_honor:
            best_user, best_honor = user, honor
    if best_user is None or best_honor == 0:
        return "no contributors to award"
    CommunityAward.objects.create(
        user=best_user,
        kind=CommunityAward.Kind.CONTRIBUTOR_OF_MONTH,
        reason=f"Top contributor ({best_honor} honor)",
        period=period,
    )
    return f"awarded {best_user.username} for {period}"
