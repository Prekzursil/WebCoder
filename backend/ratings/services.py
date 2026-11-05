"""Rating computation services (RAT-1 + round-2 SAF-2 rollback).

``compute_contest_ratings`` runs one Glicko period over a finalized rated
contest's final standings (live aggregates, DQ participations excluded).
``rollback_contest_ratings`` discards one contest's ratings and REPLAYS the
entire rated history chronologically from scratch — a full deterministic
rebuild (Glicko periods are order-dependent: a partial per-user patch-up
would silently skew every pairwise interaction, so rollback resets the
world and replays it). Cheap at platform scale, exactly correct always.
"""

import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from contests.formats import rank_contest
from contests.models import Contest, ContestParticipation, ContestScore
from notifications.services import notify
from users.models import User

from .glicko import PlayerInput, compute_contest_ratings as run_glicko_period
from .models import RatingHistory, UserRating

logger = logging.getLogger(__name__)


def _final_rank_map(contest: Contest) -> dict[int, int] | None:
    """user_id → final rank from the LIVE materialized board (DQ excluded).

    Returns None when fewer than two eligible finishers — a rated contest
    nobody contested moves no ratings.
    """
    participations = ContestParticipation.objects.filter(
        contest=contest, is_disqualified=False, is_virtual=False
    ).select_related("user")
    by_part = {}
    score_rows = ContestScore.objects.filter(
        participation__contest=contest,
        participation__is_disqualified=False,
        participation__is_virtual=False,
    ).select_related("participation", "contest_problem")
    for row in score_rows:
        by_part.setdefault(row.participation_id, []).append(
            {
                "label": row.contest_problem.label,
                "points_max": row.contest_problem.points,
                "best": row.best_score,  # live aggregates — final results
                "attempts": row.attempts,
                "wrong": row.wrong_before_ac,
                "first_ac_at": row.first_ac_at,
                "last_improvement": row.last_improvement,
            }
        )
    entries = [
        {
            "user": participation.user,
            "user_id": participation.user_id,
            "start": participation.effective_start(),
            "rows": by_part.get(participation.id, []),
        }
        for participation in participations
    ]
    if len(entries) < 2:
        return None
    standings = rank_contest(contest, entries)
    return {
        standing.user_id: position for position, standing in enumerate(standings, 1)
    }


def compute_contest_ratings(contest: Contest, *, notify_users: bool = True) -> str:
    """Apply one Glicko period for a finalized rated contest (idempotent)."""
    if not contest.is_rated:
        return f"contest {contest.id} not rated"
    if contest.state() != Contest.State.FINISHED:
        return f"contest {contest.id} not finished"
    if contest.ratings_discarded:
        return f"contest {contest.id} ratings discarded by organizer"
    if RatingHistory.objects.filter(contest=contest).exists():
        return f"contest {contest.id} already rated"

    ranks = _final_rank_map(contest)
    if not ranks:
        return f"contest {contest.id} has <2 finishers; no ratings"

    now = timezone.now()
    players = []
    states = {}
    for user_id in ranks:
        state, _created = UserRating.objects.get_or_create(user_id=user_id)
        states[user_id] = state
        players.append(
            PlayerInput(
                user_id=user_id,
                rating=state.rating,
                rd=state.rd,
                last_competition_at=state.last_competition_at,
            )
        )

    results = run_glicko_period(players, ranks, now)
    with transaction.atomic():
        for result in results:
            state = states[result.user_id]
            state.rating = result.rating
            state.rd = result.rd
            state.contests_count += 1
            state.last_competition_at = contest.end_at
            state.save()
            RatingHistory.objects.create(
                user_id=result.user_id,
                contest=contest,
                rank=ranks[result.user_id],
                rating=result.rating,
                rd=result.rd,
                delta=result.delta,
                contests_count=state.contests_count,
            )
            if notify_users:
                notify(
                    User.objects.get(pk=result.user_id),
                    "SYSTEM",
                    target=contest,
                    data={
                        "kind": "rating_update",
                        "contest_id": contest.id,
                        "delta": result.delta,
                        "rating": result.rating,
                    },
                )
    return f"contest {contest.id}: {len(results)} ratings updated"


def rollback_contest_ratings(contest: Contest) -> str:
    """SAF-2: discard one contest's ratings via deterministic full replay.

    Marks the contest discarded (finalize will never rate it again), wipes
    every rating row, then recomputes every remaining rated+finished
    contest in end_at order. Post-contest DQs naturally drop the DQ'd
    participant from the target contest's rank map on replay.
    Notifications are suppressed during replay (users keep their verdict
    notifications from the original run; re-notifying on a rebuild would
    spam every historical participant).
    """
    had = RatingHistory.objects.filter(contest=contest).exists()
    with transaction.atomic():
        RatingHistory.objects.all().delete()
        UserRating.objects.all().delete()
        contest.ratings_discarded = True
        contest.save(update_fields=["ratings_discarded", "updated_at"])

    replayed = 0
    for other in Contest.objects.filter(
        is_rated=True,
        end_at__lte=timezone.now(),
        ratings_discarded=False,
    ).order_by("end_at"):
        result = compute_contest_ratings(other, notify_users=False)
        if "ratings updated" in result:
            replayed += 1
    if not had:
        return f"contest {contest.id} was never rated; nothing to roll back"
    return f"contest {contest.id} discarded (was rated); {replayed} contests replayed"


@shared_task
def compute_contest_ratings_task(contest_id: int):
    contest = Contest.objects.filter(pk=contest_id).first()
    if contest is None:
        return f"contest {contest_id} not found"
    return compute_contest_ratings(contest)


@shared_task
def rollback_contest_ratings_task(contest_id: int):
    contest = Contest.objects.filter(pk=contest_id).first()
    if contest is None:
        return f"contest {contest_id} not found"
    return rollback_contest_ratings(contest)


def user_public_summary(user) -> dict | None:
    """Current rating + band for a public profile (None when unrated)."""
    state = UserRating.objects.filter(user=user).first()
    if state is None or state.contests_count == 0:
        return None
    from .glicko import rating_band

    return {
        "rating": state.display_rating,
        "internal_rating": state.rating,
        "rd": round(state.rd, 1),
        "contests_count": state.contests_count,
        "band": rating_band(state.display_rating),
    }
