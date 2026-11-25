"""Contributor reputation (item 66): honor → tiers → privileges.

Pure derivation over the shipped honor system (community_depth.services.
user_honor) — no new write path. The one enforced privilege is AMA
hosting (Mentor tier or staff): everything else is surfaced for the UI.
"""

from __future__ import annotations

#: (name, minimum honor) — ascending; Newcomer is the floor.
REPUTATION_TIERS: list[tuple[str, int]] = [
    ("Newcomer", 0),
    ("Contributor", 25),
    ("Trusted", 100),
    ("Mentor", 300),
    ("Legend", 1000),
]

#: tier → unlocked privilege labels (surface value; AMA hosting is the
#: enforced one — see can_host_ama).
TIER_PRIVILEGES: dict[str, list[str]] = {
    "Newcomer": ["wiki_edit", "wa_help_answer"],
    "Contributor": ["blog_publish", "problem_requests"],
    "Trusted": ["community_editorial_submit"],
    "Mentor": ["ama_host"],
    "Legend": ["ama_host", "legend_badge"],
}


def tier_for(honor: int) -> str:
    current = REPUTATION_TIERS[0][0]
    for name, minimum in REPUTATION_TIERS:
        if honor >= minimum:
            current = name
    return current


def next_tier(honor: int) -> tuple[str, int] | None:
    """The next tier and the honor still needed (None at Legend)."""
    for name, minimum in REPUTATION_TIERS:
        if honor < minimum:
            return name, minimum - honor
    return None


def user_reputation(user) -> dict:
    """The full reputation profile: honor, tier, next tier, privileges."""
    from community_depth.services import user_honor

    honor_payload = user_honor(user)
    honor = honor_payload["honor"]
    tier = tier_for(honor)
    privileges: list[str] = []
    for tier_name, tier_privs in TIER_PRIVILEGES.items():
        names = [t for t, _ in REPUTATION_TIERS]
        if names.index(tier_name) <= names.index(tier):
            privileges.extend(tier_privs)
    upcoming = next_tier(honor)
    return {
        "honor": honor,
        "breakdown": honor_payload["breakdown"],
        "tier": tier,
        "next_tier": (
            {"name": upcoming[0], "honor_needed": upcoming[1]} if upcoming else None
        ),
        "privileges": sorted(set(privileges)),
        "tiers": [
            {"name": name, "min_honor": minimum} for name, minimum in REPUTATION_TIERS
        ],
    }


def can_host_ama(user) -> bool:
    """The enforced privilege: Mentor-tier contributors (or staff) host
    AMAs — medalists earn it through community standing."""
    if not (user and getattr(user, "is_authenticated", False)):
        return False
    if user.is_superuser or user.is_staff or getattr(user, "role", "") == "ADMIN":
        return True
    from community_depth.services import user_honor

    return tier_for(user_honor(user)["honor"]) in ("Mentor", "Legend")
