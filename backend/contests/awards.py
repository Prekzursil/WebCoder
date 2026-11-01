"""Post-contest medal computation (competitive roadmap CON-11).

Pure functions over the materialized ``ContestScore`` rows so the finalize
task and tests share one code path with the standings view: the official
ranking (virtual + disqualified participations excluded) decides who sits
in the gold/silver/bronze percentage bands (HackerRank's fixed model).
"""

import math

from .formats import rank_contest
from .models import ContestAward, ContestScore

#: Fixed award percentages of the official field (HackerRank's published
#: top-25% split: 4% gold, 8% silver, 13% bronze).
GOLD_PERCENT = 0.04
SILVER_PERCENT = 0.08
BRONZE_PERCENT = 0.13


def build_ranking_input(contest, *, virtual: bool, frozen: bool = False):
    """Assemble the format strategies' input for one standings section.

    ``virtual=False`` returns the OFFICIAL field (``is_virtual=False``
    participations, disqualified excluded); ``virtual=True`` returns the
    virtual-replay field. ``frozen=True`` reads the freeze-filtered
    aggregate columns (the public board during a freeze, CON-3). Shared by
    the standings view and the award pass (which always reads live).
    """
    score_rows = ContestScore.objects.filter(
        participation__contest=contest,
        participation__is_disqualified=False,
        participation__is_virtual=virtual,
    ).select_related("participation__user", "contest_problem")
    participations: dict[int, dict] = {}
    problem_meta = {
        cp.label: {"label": cp.label, "points": cp.points}
        for cp in contest.contest_problems.all()
    }
    for row in score_rows:
        part = row.participation
        entry = participations.get(part.id)
        if entry is None:
            entry = participations[part.id] = {
                "user": part.user,
                "user_id": part.user_id,
                "start": part.effective_start(),
                "rows": [],
            }
        entry["rows"].append(
            {
                "label": row.contest_problem.label,
                "points_max": row.contest_problem.points,
                "best": row.best_score_frozen if frozen else row.best_score,
                "attempts": row.attempts_frozen if frozen else row.attempts,
                "wrong": (
                    row.wrong_before_ac_frozen if frozen else row.wrong_before_ac
                ),
                "first_ac_at": (row.first_ac_at_frozen if frozen else row.first_ac_at),
                "last_improvement": (
                    row.last_improvement_frozen if frozen else row.last_improvement
                ),
            }
        )
    entries = list(participations.values())
    for entry in entries:
        seen = {r["label"] for r in entry["rows"]}
        for meta in problem_meta.values():
            if meta["label"] not in seen:
                entry["rows"].append(
                    {
                        "label": meta["label"],
                        "points_max": meta["points"],
                        "best": 0,
                        "attempts": 0,
                        "wrong": 0,
                        "first_ac_at": None,
                        "last_improvement": None,
                    }
                )
    return entries


def official_ranking(contest):
    """Ordered official standings (best first) as [(user_id, rank)]."""
    entries = build_ranking_input(contest, virtual=False)
    standings = rank_contest(contest, entries)
    return [
        (standing.user_id, position)
        for position, standing in enumerate(standings, start=1)
    ]


def medal_for_rank(rank: int, field_size: int) -> str | None:
    """Fixed-percentage medal for an official rank (None = no medal).

    Percentages round UP (``ceil``) so tiny fields still award one of each
    medal to the leader bands — a 5-person class contest still crowns a
    gold medallist.
    """
    if rank <= 0 or field_size <= 0:
        return None
    gold = max(1, math.ceil(GOLD_PERCENT * field_size))
    silver = gold + max(0, math.ceil(SILVER_PERCENT * field_size))
    bronze = silver + max(0, math.ceil(BRONZE_PERCENT * field_size))
    if rank <= gold:
        return ContestAward.Medal.GOLD
    if rank <= silver:
        return ContestAward.Medal.SILVER
    if rank <= bronze:
        return ContestAward.Medal.BRONZE
    return None


def compute_contest_awards(contest) -> int:
    """(Re)compute this contest's medal rows from the official standings.

    Idempotent: previous rows are replaced. Returns the number of medals
    awarded. Users whose rating participation was rolled back keep their
    awards — medals reflect the standings, not the rating lifecycle.
    """
    ranking = official_ranking(contest)
    ContestAward.objects.filter(contest=contest).delete()
    field_size = len(ranking)
    awards = []
    for user_id, rank in ranking:
        medal = medal_for_rank(rank, field_size)
        if medal is not None:
            awards.append(
                ContestAward(contest=contest, user_id=user_id, medal=medal, rank=rank)
            )
    ContestAward.objects.bulk_create(awards)
    return len(awards)


def user_display_rating(user) -> int | None:
    """The user's current display rating (None when never rated)."""
    from ratings.models import UserRating

    state = UserRating.objects.filter(user=user).first()
    return state.display_rating if state else None


def registration_rating_error(contest, user) -> str | None:
    """CON-7 eligibility gate: why *user* may not register for *contest*.

    Returns None when eligible. Unset bands are open to everyone;
    unrated users may only enter contests without a minimum.
    """
    lo, hi = contest.rated_rating_min, contest.rated_rating_max
    if lo is None and hi is None:
        return None
    rating = user_display_rating(user)
    if rating is None:
        if lo is not None:
            return (
                "This division requires a contest rating — enter an open contest first."
            )
        return None
    if lo is not None and rating < lo:
        return f"This division requires a rating of at least {lo}."
    if hi is not None and rating > hi:
        return f"This division is for ratings up to {hi}."
    return None
