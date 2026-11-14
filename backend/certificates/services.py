"""Certificate issuance services — pure derivations, idempotent by design.

Every function here can run a thousand times and produce the same state:

- ``issue_contest_certificates`` — one participation atestat per official
  finisher of a rated contest (called from the ratings commit; the rank map
  and post-contest ratings are exactly what Glicko just persisted);
- ``issue_rating_milestones`` / ``recompute_solve_milestones`` — peak
  achievements (once crossed in rated competition / once solved, kept for
  life — a later organic rating drop never un-earns a diploma);
- ``revoke_contest_certificates`` / ``audit_rating_milestones`` — the
  integrity side: rollback/DQ tooling flips affected atestats to REVOKED
  with a reason instead of silently deleting them (the verification page
  keeps answering, honestly).

Notifications fire only on the event-driven paths (a live contest
commit / a live solve), never from the backfill command — replaying
history must never spam.
"""

import logging

from django.db import IntegrityError, transaction
from django.utils import timezone

from notifications.services import notify

from .models import Certificate

logger = logging.getLogger(__name__)

#: Ladder thresholds (RAT-3 color bands start at 1200; 2000+ is "legend"
#: territory on a young ladder) — the honest "skill" atestat a small rated
#: community can actually stand behind.
RATING_THRESHOLDS: tuple[int, ...] = (1200, 1400, 1600, 1800, 2000)

#: Distinct-APPROVED-problems-solved milestones — same derivation as the
#: leaderboard (D-B8), so the atestat cannot disagree with the standings.
SOLVE_THRESHOLDS: tuple[int, ...] = (10, 50, 100, 250, 500)

_REVOKED_BELOW_THRESHOLD = "rating history rolled back below milestone"


def _issue(
    user_id: int,
    kind: str,
    *,
    contest=None,
    threshold: int | None = None,
    details: dict | None = None,
    notify_user: bool = True,
) -> Certificate | None:
    """Create the atestat if absent; None when it already exists.

    Never resurrects or edits an existing row (peak semantics + audit
    trail). The IntegrityError path covers the rare double-delivery race
    on the same user — the loser simply observes the winner's row.
    """
    try:
        with transaction.atomic():
            cert, created = Certificate.objects.get_or_create(
                user_id=user_id,
                kind=kind,
                contest=contest,
                threshold=threshold,
                defaults={"details": details or {}},
            )
            if not created:
                return None
            cert.serial = f"WC-{timezone.now().year}-{cert.pk:06d}"
            cert.save(update_fields=["serial"])
    except IntegrityError:
        logger.info(
            "certificate race lost for user=%s kind=%s threshold=%s",
            user_id,
            kind,
            threshold,
        )
        return None
    if notify_user:
        from users.models import User

        notify(
            User.objects.filter(pk=user_id).first(),
            "SYSTEM",
            target=cert,
            data={
                "kind": "certificate_issued",
                "certificate_kind": cert.kind,
                "serial": cert.serial,
                "certificate_uuid": str(cert.uuid),
            },
        )
    return cert


def issue_contest_certificates(
    contest,
    ranks: dict[int, int],
    ratings_after: dict[int, int],
    *,
    notify_users: bool = True,
) -> list[Certificate]:
    """Participation atestats for every official finisher of a rated contest.

    ``ranks`` / ``ratings_after`` are the exact values the ratings commit
    just persisted — the snapshot is taken from the source of truth, then
    frozen into ``details`` (the atestat must not change meaning if the
    contest title is later edited).
    """
    title = contest.title_i18n if isinstance(contest.title_i18n, dict) else {}
    issued: list[Certificate] = []
    for user_id, rank in ranks.items():
        cert = _issue(
            user_id,
            Certificate.Kind.CONTEST_PARTICIPATION,
            contest=contest,
            details={
                "rank": rank,
                "rating_after": ratings_after.get(user_id),
                "contest_id": contest.id,
                "contest_title_en": title.get("en", str(contest)),
                "contest_title_ro": title.get("ro", title.get("en", str(contest))),
                "contest_end": contest.end_at.date().isoformat(),
            },
            notify_user=notify_users,
        )
        if cert is not None:
            issued.append(cert)
    return issued


def issue_rating_milestones(
    user_id: int, rating: int, *, notify_user: bool = True
) -> list[Certificate]:
    """Atestats for every ladder threshold at or below ``rating`` (peak)."""
    issued: list[Certificate] = []
    for threshold in RATING_THRESHOLDS:
        if rating < threshold:
            break  # thresholds are ascending
        cert = _issue(
            user_id,
            Certificate.Kind.RATING_MILESTONE,
            threshold=threshold,
            details={"rating": rating, "threshold": threshold},
            notify_user=notify_user,
        )
        if cert is not None:
            issued.append(cert)
    return issued


def recompute_solve_milestones(
    user_id: int, *, notify_user: bool = True
) -> list[Certificate]:
    """Atestats for every solve threshold reached by the leaderboard row.

    Reads the same ``LeaderboardEntry`` the standings render, so a solve
    certificate and the leaderboard can never disagree.
    """
    from leaderboard.models import LeaderboardEntry

    entry = LeaderboardEntry.objects.filter(user_id=user_id).first()
    solved = entry.solved_count if entry else 0
    issued: list[Certificate] = []
    for threshold in SOLVE_THRESHOLDS:
        if solved < threshold:
            break  # thresholds are ascending
        cert = _issue(
            user_id,
            Certificate.Kind.SOLVE_MILESTONE,
            threshold=threshold,
            details={"solved": solved, "threshold": threshold},
            notify_user=notify_user,
        )
        if cert is not None:
            issued.append(cert)
    return issued


def revoke_contest_certificates(contest, reason: str) -> int:
    """Flip every active atestat of one contest to REVOKED (rollback/DQ)."""
    return Certificate.objects.filter(contest=contest, revoked_at__isnull=True).update(
        revoked_at=timezone.now(), revoked_reason=reason[:200]
    )


def _revoke(cert: Certificate, reason: str) -> None:
    cert.revoked_at = timezone.now()
    cert.revoked_reason = reason[:200]
    cert.save(update_fields=["revoked_at", "revoked_reason"])


def audit_rating_milestones(reason: str = _REVOKED_BELOW_THRESHOLD) -> int:
    """Post-rollback audit: revoke milestones the replayed ladder no longer
    supports (a finisher whose only strong result was the discarded contest
    keeps an honest REVOKED atestat, not a phantom 1600).

    Users whose rating history vanished entirely (every rated contest
    discarded) lose every milestone the same way.
    """
    from ratings.models import UserRating

    revoked = 0
    ratings = {
        row["user_id"]: row["rating"]
        for row in UserRating.objects.values("user_id", "rating")
    }
    stale = Certificate.objects.filter(
        kind=Certificate.Kind.RATING_MILESTONE, revoked_at__isnull=True
    )
    for cert in stale:
        rating = ratings.get(cert.user_id)
        if rating is None or (cert.threshold or 0) > rating:
            _revoke(cert, reason)
            revoked += 1
    return revoked


def backfill(*, notify_users: bool = False) -> dict[str, int]:
    """Idempotent full derivation over existing history.

    Powers the ``issue_certificates`` management command (initial rollout
    after this feature lands, and the recovery path after any manual data
    surgery). Notifications stay off by default — replaying history must
    never spam.
    """
    from leaderboard.models import LeaderboardEntry
    from ratings.models import RatingHistory, UserRating

    participation = 0
    milestones = 0
    solves = 0

    history = RatingHistory.objects.order_by("contest_id", "user_id").values(
        "user_id",
        "contest_id",
        "rank",
        "rating",
        "contest__title_i18n",
        "contest__end_at",
    )
    by_contest: dict[int, dict] = {}
    for row in history:
        info = by_contest.setdefault(
            row["contest_id"],
            {
                "ranks": {},
                "ratings": {},
            },
        )
        info["ranks"][row["user_id"]] = row["rank"]
        info["ratings"][row["user_id"]] = row["rating"]

    from contests.models import Contest

    for contest_id, info in by_contest.items():
        contest = Contest.objects.filter(pk=contest_id).first()
        if contest is None:  # pragma: no cover - FK guarantees the row
            continue
        participation += len(
            issue_contest_certificates(
                contest, info["ranks"], info["ratings"], notify_users=notify_users
            )
        )

    for row in UserRating.objects.values("user_id", "rating"):
        milestones += len(
            issue_rating_milestones(row["user_id"], row["rating"], notify_user=notify_users)
        )
    for row in LeaderboardEntry.objects.values("user_id"):
        solves += len(recompute_solve_milestones(row["user_id"], notify_user=notify_users))

    return {
        "participation": participation,
        "rating_milestones": milestones,
        "solve_milestones": solves,
    }
