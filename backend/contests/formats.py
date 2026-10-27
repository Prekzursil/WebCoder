"""Pluggable contest ranking formats (competitive roadmap CON-2).

Each strategy ranks one participation's materialized ``ContestScore`` rows
(round-2 PRF-1) into a comparable standing. The strategies are pure
functions over plain data so they are trivially testable and new formats
(DOM ECOO, Codeforces points-with-decay…) are one function + one registry
entry — never a fork of the engine.

Ranking inputs (one dict per participation):

``rows``     list of dicts {points_max, best, attempts, wrong, first_ac_at, last_improvement}
             where timestamps are timezone-aware datetimes inside the
             participation's own window (elapsed offsets are computed here).
``start``    the participation's effective start (personal clock origin).

Ranking outputs: a sort key + the display columns (score, solved, penalty).
Stricter (better) standings sort FIRST ascending.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Callable

from django.utils import timezone


@dataclass(frozen=True)
class Standing:
    """One ranked participation's display columns."""

    user_id: int
    total_score: float
    solved: int
    penalty_minutes: float
    # Ascending sort key — better participations compare smaller.
    rank_key: tuple


def _elapsed_minutes(start: datetime, at: datetime | None) -> float:
    """Minutes from the participation start; unsolved/None sorts last via inf."""
    if at is None or start is None:
        return float("inf")
    return max(0.0, (at - start).total_seconds() / 60.0)


def _is_solved(row: dict) -> bool:
    return row["points_max"] > 0 and row["best"] >= row["points_max"]


def rank_ioi(contest, participations) -> list[Standing]:
    """IOI: sum of best per-problem points; earlier last-improvement wins ties."""

    standings = []
    for part in participations:
        rows = part["rows"]
        total = sum(r["best"] for r in rows)
        improvements = [
            r["last_improvement"]
            for r in rows
            if r["best"] > 0 and r["last_improvement"] is not None
        ]
        last = max(improvements) if improvements else None
        standings.append(
            Standing(
                user_id=part["user_id"],
                total_score=total,
                solved=sum(1 for r in rows if _is_solved(r)),
                penalty_minutes=0,
                rank_key=(-total, _elapsed_minutes(part["start"], last)),
            )
        )
    standings.sort(key=lambda s: s.rank_key)
    return standings


def rank_icpc(contest, participations) -> list[Standing]:
    """ICPC: solved count desc, then penalty = solve minute + wrong*penalty_time.

    Only *solved* problems contribute penalty (DOMjudge semantics); compile
    errors are excluded from the wrong count upstream (``scoring.py``).
    """

    penalty_time = contest.penalty_time_minutes
    standings = []
    for part in participations:
        rows = part["rows"]
        solved_rows = [r for r in rows if _is_solved(r)]
        penalty = 0.0
        for r in solved_rows:
            penalty += _elapsed_minutes(part["start"], r["first_ac_at"])
            penalty += r["wrong"] * penalty_time
        solved = len(solved_rows)
        last = max(
            (r["first_ac_at"] for r in solved_rows if r["first_ac_at"] is not None),
            default=None,
        )
        standings.append(
            Standing(
                user_id=part["user_id"],
                total_score=float(solved),
                solved=solved,
                penalty_minutes=penalty,
                rank_key=(-solved, penalty, _elapsed_minutes(part["start"], last)),
            )
        )
    standings.sort(key=lambda s: s.rank_key)
    return standings


def rank_atcoder(contest, participations) -> list[Standing]:
    """AtCoder-style: score desc, then last-AC minute + wrong*penalty_factor."""

    penalty_factor = contest.penalty_factor_minutes
    standings = []
    for part in participations:
        rows = part["rows"]
        solved_rows = [r for r in rows if _is_solved(r)]
        total = sum(r["best"] for r in rows)
        penalty = 0.0
        for r in solved_rows:
            penalty += r["wrong"] * penalty_factor
        last = max(
            (r["first_ac_at"] for r in solved_rows if r["first_ac_at"] is not None),
            default=None,
        )
        penalty += _elapsed_minutes(part["start"], last)
        standings.append(
            Standing(
                user_id=part["user_id"],
                total_score=total,
                solved=len(solved_rows),
                penalty_minutes=penalty,
                rank_key=(-total, penalty, _elapsed_minutes(part["start"], last)),
            )
        )
    standings.sort(key=lambda s: s.rank_key)
    return standings


#: Registry: Contest.Format value -> ranking strategy.
FORMAT_STRATEGIES: dict[str, Callable] = {
    "IOI": rank_ioi,
    "ICPC": rank_icpc,
    "ATCODER": rank_atcoder,
}


def rank_contest(contest, participations) -> list[Standing]:
    """Rank with the contest's configured strategy (IOI fallback)."""
    strategy = FORMAT_STRATEGIES.get(contest.format, rank_ioi)
    return strategy(contest, participations)


def now_provider() -> datetime:  # pragma: no cover - trivial indirection
    """Injection point for time-aware callers (kept for symmetry)."""
    return timezone.now()
