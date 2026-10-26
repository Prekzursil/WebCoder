"""Glicko rating engine (competitive roadmap RAT-1).

Pure functions implementing Glickman's Glicko system (1999) with one rating
period per rated contest. Outcomes are pairwise by final rank inside the
contest — the participant who finished ahead wins the pairing (ties share
0.5). Players who tie on the format's rank key are treated as drawn pairs.

References: http://www.glicko.net/glicko/glicko.pdf (Glickman).
infoarena's 15+ year public Glicko clasament is the local precedent.
"""

from dataclasses import dataclass
from datetime import datetime
from math import pi, sqrt

from .models import DEFAULT_RD, DEFAULT_RATING, RD_C_PER_YEAR, RD_MAX

#: q = ln(10)/400 — the Glicko scale constant.
Q = 0.0057565


@dataclass(frozen=True)
class PlayerInput:
    """A participant's pre-contest Glicko state."""

    user_id: int
    rating: int = DEFAULT_RATING
    rd: float = DEFAULT_RD
    last_competition_at: datetime | None = None


@dataclass(frozen=True)
class PlayerResult:
    """The post-contest state written back to UserRating/RatingHistory."""

    user_id: int
    rating: int
    rd: float
    delta: int


def g(rd: float) -> float:
    return 1.0 / sqrt(1.0 + 3.0 * Q**2 * rd**2 / pi**2)


def expectation(r: float, r_opponent: float, rd_opponent: float) -> float:
    return 1.0 / (1.0 + 10 ** (-g(rd_opponent) * (r - r_opponent) / 400.0))


def decay_rd(rd: float, last_at: datetime | None, now: datetime) -> float:
    """Inactivity drift between periods (capped at RD_MAX)."""
    if last_at is None:
        return min(rd, RD_MAX)
    years = max(0.0, (now - last_at).total_seconds() / (365.25 * 24 * 3600))
    return min(sqrt(rd**2 + (RD_C_PER_YEAR**2) * years), RD_MAX)


def _pair_outcome(rank_a: int, rank_b: int) -> float:
    """Score of A's pairing against B from final ranks (better rank wins)."""
    if rank_a < rank_b:
        return 1.0
    if rank_a > rank_b:
        return 0.0
    return 0.5


def compute_contest_ratings(
    players: list[PlayerInput], ranks: dict[int, int], now: datetime
) -> list[PlayerResult]:
    """One Glicko period over a contest.

    ``players``: every eligible (non-disqualified) participant with their
    pre-contest state; ``ranks`` maps user_id → final rank (1 = first).
    Each participant plays one pairing against every other participant —
    the standard multi-player reduction Glicko supports natively.

    Returns per-player results, or [] when fewer than two players (a rated
    contest needs at least two finishers to move anyone's rating).
    """
    if len(players) < 2:
        return []

    results: list[PlayerResult] = []
    for player in players:
        rd_eff = decay_rd(player.rd, player.last_competition_at, now)
        inv_d2 = 0.0  # accumulates q²·g²·E·(1−E)
        delta_num = 0.0  # accumulates g·(s − E)
        for opponent in players:
            if opponent.user_id == player.user_id:
                continue
            rd_op = decay_rd(opponent.rd, opponent.last_competition_at, now)
            e = expectation(player.rating, opponent.rating, rd_op)
            s = _pair_outcome(ranks[player.user_id], ranks[opponent.user_id])
            g_op = g(rd_op)
            inv_d2 += Q**2 * g_op**2 * e * (1.0 - e)
            delta_num += g_op * (s - e)

        if inv_d2 <= 0.0:  # pragma: no cover - impossible with ≥1 opponent
            new_rating, new_rd = player.rating, rd_eff
        else:
            d2 = 1.0 / inv_d2
            denom = 1.0 / rd_eff**2 + 1.0 / d2
            new_rating = player.rating + (Q / denom) * delta_num
            new_rd = sqrt(1.0 / denom)
        new_rating = max(100, int(round(new_rating)))
        results.append(
            PlayerResult(
                user_id=player.user_id,
                rating=new_rating,
                rd=round(new_rd, 2),
                delta=new_rating - player.rating,
            )
        )
    return results


def rating_band(display_rating: int) -> dict:
    """RAT-3 color band for a display rating (Codeforces-style ladder).

    The single source of truth for handle colors everywhere — profile,
    leaderboards, standings, forum posts.
    """
    for band in RATING_BANDS:
        if display_rating >= band["min"]:
            return band
    return RATING_BANDS[-1]  # pragma: no cover - table floors at 0


#: Band table (RAT-3): min threshold, bilingual name, hex color.
RATING_BANDS: list[dict] = [
    {"min": 2300, "name_en": "Legendary Grandmaster", "name_ro": "Grandmaster legendar", "color": "#8b0000"},
    {"min": 2100, "name_en": "Grandmaster", "name_ro": "Grandmaster", "color": "#cc0000"},
    {"min": 1900, "name_en": "Master", "name_ro": "Master", "color": "#ff6600"},
    {"min": 1600, "name_en": "Expert", "name_ro": "Expert", "color": "#aa00aa"},
    {"min": 1400, "name_en": "Specialist", "name_ro": "Specialist", "color": "#0000ff"},
    {"min": 1200, "name_en": "Pupil", "name_ro": "Începător avansat", "color": "#008000"},
    {"min": 0, "name_en": "Newbie", "name_ro": "Începător", "color": "#808080"},
]
