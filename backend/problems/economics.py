"""Problem-point economics (problem-page experience wave, item G).

Every problem carries a finite point value (``Problem.target_points`` — the
author's declared total that the per-test points should sum to) bounded by
the problem's difficulty label:

    VERY_EASY 1–10 · EASY 10–50 · MEDIUM 50–200 · HARD 200–500 · VERY_HARD 500–1000

The bands are deployment-configurable via ``PROBLEM_DIFFICULTY_POINT_RANGES``
but clamped by the absolute ``PROBLEM_POINT_FLOOR`` / ``PROBLEM_POINT_CEILING``
(1 / 1000), so no configuration lets a problem carry a cheeseable huge value.
The rule is enforced at the model-validation layer (``Problem.clean()``) and
re-checked in the approval workflow — see ``views.ProblemViewSet.approve_problem``.
"""

from django.conf import settings
from django.core.exceptions import ValidationError

#: Difficulties with a configured point band (mirrors the default settings
#: map; used by the authoring UI to render the inline range hint).
DEFAULT_RANGES: dict[str, tuple[int, int]] = {
    "VERY_EASY": (1, 10),
    "EASY": (10, 50),
    "MEDIUM": (50, 200),
    "HARD": (200, 500),
    "VERY_HARD": (500, 1000),
}


def difficulty_point_ranges() -> dict[str, tuple[int, int]]:
    """The effective per-difficulty (min, max) point bands, floor/ceiling-clamped."""
    raw = getattr(settings, "PROBLEM_DIFFICULTY_POINT_RANGES", None) or DEFAULT_RANGES
    floor = int(getattr(settings, "PROBLEM_POINT_FLOOR", 1))
    ceiling = int(getattr(settings, "PROBLEM_POINT_CEILING", 1000))
    if ceiling < floor:  # misconfiguration guard: a degenerate band set fails closed
        raise ValueError("PROBLEM_POINT_CEILING must be >= PROBLEM_POINT_FLOOR")
    clamped: dict[str, tuple[int, int]] = {}
    for difficulty, band in raw.items():
        low, high = int(band[0]), int(band[1])
        clamped[difficulty] = (max(floor, low), min(ceiling, high))
    return clamped


def point_bounds(difficulty: str) -> tuple[int, int] | None:
    """The (min, max) band for one difficulty, or None when unconfigured."""
    return difficulty_point_ranges().get(difficulty)


def validate_target_points(difficulty: str, target_points) -> None:
    """Raise ``ValidationError`` unless ``target_points`` fits the difficulty band.

    Enforced from ``Problem.clean()`` (the model-validation layer — admin and
    full_clean callers hit it) and from the API serializer's validate() so
    every authoring write is checked.
    """
    floor = int(getattr(settings, "PROBLEM_POINT_FLOOR", 1))
    ceiling = int(getattr(settings, "PROBLEM_POINT_CEILING", 1000))
    if target_points is None:
        raise ValidationError(
            {
                "target_points": f"A point value between {floor} and {ceiling} is required."
            }
        )
    points = int(target_points)
    if points < floor or points > ceiling:
        raise ValidationError(
            {
                "target_points": (
                    f"Point value {points} is outside the absolute bounds "
                    f"[{floor}, {ceiling}]."
                )
            }
        )
    band = point_bounds(difficulty)
    if band is not None and not (band[0] <= points <= band[1]):
        raise ValidationError(
            {
                "target_points": (
                    f"Difficulty {difficulty} problems are worth {band[0]}–{band[1]} "
                    f"points; {points} is out of band."
                )
            }
        )


def target_points_for_difficulty(difficulty: str) -> int:
    """A sensible default point value for a difficulty (the band's midpoint)."""
    band = point_bounds(difficulty)
    if band is None:
        return 100
    return (band[0] + band[1]) // 2
