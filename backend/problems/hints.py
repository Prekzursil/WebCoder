"""Tiered hint state (problem-page experience wave, item D).

Hints are a per-problem ladder of at most three tiers — 1 gentle nudge,
2 stronger, 3 approach outline — stored on ``Problem.hints_ro`` /
``Problem.hints_en`` as a JSON list whose entries are either plain
strings (the legacy EDT-2 ladder) or objects ``{"content": str,
"image": url}`` (graphical hints — diagrams welcome). Reveals are
voluntary and FREE: no point penalty, ever; usage is recorded per
(user, problem, tier) in ``HintReveal`` for analytics + the author
dashboard.

This module is the single place that normalizes the stored JSON into the
``{tier, kind, content, image}`` shape the API serves, so the serializer,
the reveal endpoint and the offline pack all agree.
"""

from problems.models import HintReveal, Problem

#: Tier metadata: id -> (machine kind, EN label, RO label).
TIER_META: dict[int, tuple[str, str, str]] = {
    1: ("NUDGE", "Gentle nudge", "Indiciu ușor"),
    2: ("STRONGER", "Stronger hint", "Indiciu mai puternic"),
    3: ("APPROACH", "Approach outline", "Schița abordării"),
}

TIER_MAX = 3


def _normalize_entry(raw, tier: int) -> dict:
    """One stored JSON entry -> {tier, kind, content, image}."""
    kind = TIER_META.get(tier, ("TIER", "Hint", "Indiciu"))[0]
    if isinstance(raw, dict):
        return {
            "tier": tier,
            "kind": kind,
            "content": str(raw.get("content", "")),
            "image": str(raw.get("image", "")) or None,
        }
    return {
        "tier": tier,
        "kind": kind,
        "content": str(raw),
        "image": None,
    }


def hint_entries(problem: Problem, locale: str) -> list[dict]:
    """The problem's hint ladder in the locale (fallback to the other)."""
    primary = problem.hints_en if locale == "en" else problem.hints_ro
    fallback = problem.hints_ro if locale == "en" else problem.hints_en
    raw_list = primary or fallback or []
    if not isinstance(raw_list, list):
        raw_list = []
    return [
        _normalize_entry(entry, tier)
        for tier, entry in enumerate(raw_list[:TIER_MAX], start=1)
    ]


def _user_is_privileged(user, problem: Problem) -> bool:
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    from users.models import User

    return bool(
        user.is_superuser
        or user.is_staff
        or getattr(user, "role", "") in (User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER)
        or problem.author_id == user.id
        or problem.verifier_id == user.id
    )


def hint_state_for(problem: Problem, user, locale: str = "en") -> dict:
    """The viewer-facing hint payload.

    ``tiers`` lists every authored tier with ``revealed`` flags; content is
    included ONLY for revealed tiers (or for privileged viewers — authors
    need to proofread their own ladder). Reveal counts are cheap analytics
    the author dashboard aggregates.
    """
    entries = hint_entries(problem, locale)
    revealed: set[int] = set()
    if user is not None and getattr(user, "is_authenticated", False):
        revealed = set(
            HintReveal.objects.filter(user=user, problem=problem).values_list(
                "tier", flat=True
            )
        )
    privileged = _user_is_privileged(user, problem)
    tiers = []
    for index, entry in enumerate(entries, start=1):
        is_revealed = entry["tier"] in revealed or privileged
        tiers.append(
            {
                "tier": entry["tier"],
                "kind": entry["kind"],
                "revealed": entry["tier"] in revealed,
                "content": entry["content"] if is_revealed else None,
                "image": entry["image"] if is_revealed else None,
            }
        )
    return {
        "total": len(entries),
        "revealed_count": sum(1 for t in tiers if t["revealed"]),
        "tiers": tiers,
    }
