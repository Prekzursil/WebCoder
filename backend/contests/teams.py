"""Team-contest aggregation + prediction calibration (wave F items 49/55).

- ``teams_ranking``: one synthetic participation entry per team over the
  members' materialized ``ContestScore`` rows (best per problem across the
  team, summed attempts, earliest first-solve) — the same shape
  ``build_ranking_input`` produces, so ``rank_contest`` orders teams with
  the contest's own format.
- ``actual_rank``: a user's final rank in a contest, from ``RatingHistory``
  (rated contests) or the materialized standings (unrated ones).
- ``calibration``: predicted-vs-actual history with mean absolute error and
  the over/under-confidence bias.
"""

from __future__ import annotations

from contests.formats import rank_contest
from contests.models import ContestPrediction, ContestScore


def teams_ranking(contest) -> list[dict]:
    """The team board for a team contest: aggregated per-team rows ranked by
    the contest's format. Returns ``[{team, members, rank, rows}]`` where
    ``rows`` mirror the individual standings problem cells.
    """
    teams = list(contest.teams.prefetch_related("members__user").order_by("name"))
    contest_problems = list(contest.contest_problems.all())
    entries = []
    for team in teams:
        member_ids = [member.user_id for member in team.members.all()]
        score_rows = ContestScore.objects.filter(
            participation__contest=contest,
            participation__user_id__in=member_ids,
        ).select_related("contest_problem")
        cells: dict[int, dict] = {}
        for row in score_rows:
            cell = cells.setdefault(
                row.contest_problem_id,
                {
                    "label": row.contest_problem.label,
                    "points_max": row.contest_problem.points,
                    "best": 0.0,
                    "attempts": 0,
                    "wrong": 0,
                    "first_ac_at": None,
                    "last_improvement": None,
                },
            )
            cell["attempts"] += row.attempts
            cell["wrong"] += row.wrong_before_ac
            if row.best_score > cell["best"]:
                cell["best"] = row.best_score
                cell["last_improvement"] = row.last_improvement
            if row.first_ac_at is not None and (
                cell["first_ac_at"] is None or row.first_ac_at < cell["first_ac_at"]
            ):
                cell["first_ac_at"] = row.first_ac_at
        entries.append(
            {
                "team": team,
                "members": [member.user.username for member in team.members.all()],
                "rows": [cells[cp.id] for cp in contest_problems if cp.id in cells],
            }
        )
    # Synthesize the rank_contest participation shape, then map back.
    ranked = rank_contest(
        contest,
        [
            {
                "user": entry["team"],
                "user_id": entry["team"].id,
                "rows": entry["rows"],
                # ICPC/AtCoder penalty math needs a clock origin — the
                # contest start stands in for the team's shared clock.
                "start": contest.start_at,
            }
            for entry in entries
        ],
    )
    output = []
    for position, standing in enumerate(ranked, start=1):
        entry = next(e for e in entries if e["team"].id == standing.user_id)
        output.append(
            {
                "rank": position,
                "team": entry["team"].name,
                "team_id": entry["team"].id,
                "members": entry["members"],
                "score": standing.total_score,
                "solved": standing.solved,
                "problems": sorted(entry["rows"], key=lambda r: r["label"]),
            }
        )
    return output


def actual_rank(contest, user_id: int) -> int | None:
    """The user's final rank: RatingHistory for rated contests (the recorded
    rank at rating time), else their position on the materialized board."""
    from ratings.models import RatingHistory

    history = RatingHistory.objects.filter(contest=contest, user_id=user_id).first()
    if history is not None:
        return history.rank
    from contests.awards import build_ranking_input

    standings = rank_contest(contest, build_ranking_input(contest, virtual=False))
    for position, standing in enumerate(standings, start=1):
        if standing.user_id == user_id:
            return position
    return None


def calibration(user) -> dict:
    """Item 55 — the predictor's calibration profile over finished rated
    contests: every prediction paired with the actual rank, the signed
    error (predicted − actual: negative = predicted better than landed,
    i.e. optimistic) and the summary statistics."""
    rows = []
    for prediction in (
        ContestPrediction.objects.filter(user=user)
        .select_related("contest")
        .order_by("-contest__end_at")
    ):
        contest = prediction.contest
        if contest.state() != contest.State.FINISHED:
            # Still open — shown as pending, excluded from the statistics.
            rows.append(
                {
                    "contest": contest.id,
                    "title": contest.title_i18n.get("en", f"Contest {contest.id}")
                    if isinstance(contest.title_i18n, dict)
                    else f"Contest {contest.id}",
                    "predicted_rank": prediction.predicted_rank,
                    "actual_rank": None,
                    "error": None,
                    "state": contest.state(),
                }
            )
            continue
        rank = actual_rank(contest, user.id)
        error = prediction.predicted_rank - rank if rank is not None else None
        rows.append(
            {
                "contest": contest.id,
                "title": contest.title_i18n.get("en", f"Contest {contest.id}")
                if isinstance(contest.title_i18n, dict)
                else f"Contest {contest.id}",
                "predicted_rank": prediction.predicted_rank,
                "actual_rank": rank,
                "error": error,
                "state": contest.state(),
            }
        )
    errors = [row["error"] for row in rows if row["error"] is not None]
    count = len(errors)
    return {
        "count": count,
        "mean_abs_error": round(sum(abs(e) for e in errors) / count, 2)
        if count
        else None,
        "bias": round(sum(errors) / count, 2) if count else None,
        "results": rows,
    }
