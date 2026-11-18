"""Divisions with promotion cutoffs (wave F item 53) + percentile math
(item 52).

Divisions are static display-rating bands (the USACO/CodeChef promotion
model, layered on RAT-3's color bands): crossing a cutoff between two
consecutive rated contests is a promotion/demotion EVENT, derived from
``RatingHistory`` — no new write path, replayed ratings stay consistent.
"""

from __future__ import annotations

from contests.models import ContestAward
from .models import RatingHistory, UserRating

#: (name, minimum display rating) — ascending; Div 4 is the floor.
DIVISIONS: list[tuple[str, int]] = [
    ("Div 4", 0),
    ("Div 3", 1200),
    ("Div 2", 1600),
    ("Div 1", 1900),
]


def division_for(display_rating: int | float) -> str:
    """The division a display rating sits in (the highest band it clears)."""
    current = DIVISIONS[0][0]
    for name, minimum in DIVISIONS:
        if display_rating >= minimum:
            current = name
    return current


def division_thresholds() -> list[dict]:
    """The promotion table + current population per division."""
    counts = {name: 0 for name, _ in DIVISIONS}
    for state in UserRating.objects.filter(contests_count__gt=0):
        counts[division_for(state.display_rating)] += 1
    return [
        {"name": name, "min_rating": minimum, "players": counts[name]}
        for name, minimum in DIVISIONS
    ]


def division_changes(user) -> list[dict]:
    """Walk the user's rating history in contest order and emit a
    promotion/demotion event at every division boundary crossing."""
    rows = list(
        RatingHistory.objects.filter(user=user)
        .select_related("contest")
        .order_by("contest__end_at", "contest__id")
    )
    events: list[dict] = []
    previous = None
    for row in rows:
        current = division_for(row.display_rating)
        if previous is not None and current != previous:
            names = [name for name, _ in DIVISIONS]
            promoted = names.index(current) > names.index(previous)
            events.append(
                {
                    "contest": row.contest_id,
                    "title": (
                        row.contest.title_i18n.get("en", f"Contest {row.contest_id}")
                        if isinstance(row.contest.title_i18n, dict)
                        else f"Contest {row.contest_id}"
                    ),
                    "from": previous,
                    "to": current,
                    "kind": "promoted" if promoted else "demoted",
                    "rating": row.display_rating,
                }
            )
        previous = current
    return events


def user_division(user) -> dict:
    """Current division + the promotion/demotion history for one user."""
    state = UserRating.objects.filter(user=user).first()
    if state is None or state.contests_count == 0:
        return {"division": None, "rated": False, "changes": []}
    return {
        "division": division_for(state.display_rating),
        "rated": True,
        "display_rating": state.display_rating,
        "changes": division_changes(user),
    }


def percentiles(user) -> dict:
    """Item 52 — where a user's display rating sits: overall, inside their
    school and inside their county (better-than share, 0-100)."""
    state = UserRating.objects.filter(user=user).first()
    if state is None or state.contests_count == 0:
        return {"rated": False}

    def cohort_payload(members):
        total = members.count()
        if total == 0:
            return None
        better = members.filter(rating__lt=state.rating).count()
        return {
            "percentile": round(100.0 * better / total, 1),
            "total": total,
        }

    rated = UserRating.objects.filter(contests_count__gt=0)
    overall = cohort_payload(rated)
    school = county = None
    school_name = (getattr(user, "school", "") or "").strip()
    county_name = (getattr(user, "county", "") or "").strip()
    if school_name:
        school = cohort_payload(
            rated.filter(user__school__iexact=school_name).exclude(user_id=user.id)
        )
    if county_name:
        county = cohort_payload(
            rated.filter(user__county__iexact=county_name).exclude(user_id=user.id)
        )
    return {
        "rated": True,
        "display_rating": state.display_rating,
        "overall": overall,
        "school": {"name": school_name, **school} if school else None,
        "county": {"name": county_name, **county} if county else None,
    }


def graph_annotations(user) -> dict[int, dict]:
    """Item 51 — per-history-index annotations for the rating graph:
    career-high peaks, contest medals and division crossings. Keyed by the
    index into the chronological RatingHistory list."""
    rows = list(
        RatingHistory.objects.filter(user=user)
        .select_related("contest")
        .order_by("contest__end_at", "contest__id")
    )
    medals = {
        award.contest_id: award.medal
        for award in ContestAward.objects.filter(user=user)
    }
    by_division_change = {event["contest"]: event for event in division_changes(user)}
    annotations: dict[int, dict] = {}
    peak = 0
    for index, row in enumerate(rows):
        marks: dict = {}
        if row.display_rating > peak:
            peak = row.display_rating
            marks["peak"] = peak
        if row.contest_id in medals:
            marks["medal"] = medals[row.contest_id]
        if row.contest_id in by_division_change:
            marks["division_change"] = by_division_change[row.contest_id]["kind"]
            marks["division"] = by_division_change[row.contest_id]["to"]
        if marks:
            annotations[index] = marks
    return annotations
