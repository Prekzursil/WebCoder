"""Community depth services (competitive roadmap Wave C).

- COM-3: the public recent-verdicts feed (no code, ever).
- COM-7: post-solve solution browsing with the platform-display license.
- RAT-8: contributor honor — a pure derivation over data the platform
  already stores (approved problems/editorials/articles + upvoted posts),
  exactly the Codewars honor mechanics the roadmap sketches.
- RAT-9: the weekly-reset leaderboard segment.
- RAT-10: trust-weighted voting + anti-brigading rules.
"""

from datetime import timedelta

from django.db.models import Sum
from django.utils import timezone

from forum.models import Post
from problems.models import Article, CommunityEditorial, Problem
from submissions.models import Submission

from leaderboard.models import LeaderboardEntry

#: RAT-10 day-one rules (Codeforces precedent, cf. blog/entry/76361 + 8963):
#: votes count only from accounts with at least one accepted submission;
#: small negatives render as 0; auto-hide threshold leaves an audit row.
VOTE_MIN_AC = 1
NEGATIVE_RENDER_FLOOR = 0  # net scores in [-RENDER_ZERO_BAND, 0) show as 0
AUTO_HIDE_THRESHOLD = -25


def user_has_ac(user) -> bool:
    """≥1 accepted submission on an APPROVED problem (the vote trust floor)."""
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    return (
        Submission.objects.filter(
            user=user,
            verdict=Submission.VerdictStatus.ACCEPTED,
            problem__status=Problem.ProblemStatus.APPROVED,
        ).exists()
    )


def effective_score(raw: int) -> int:
    """RAT-10 display rule: negatives never render below 0 (anti-drama) —
    rows at/below the hide threshold are hidden from lists anyway, so the
    displayed number on a visible row is always >= 0."""
    return max(raw, NEGATIVE_RENDER_FLOOR)


def apply_vote_rules(post: Post, raw_score: int | None = None) -> Post:
    """Clamp the displayed score and auto-hide at the threshold.

    ``raw_score`` is the un-clamped vote sum (the caller recompute); the
    hide threshold fires on the RAW total (-25 Codeforces precedent) while
    the displayed score floors at 0. The hidden row keeps its audit trail
    (SAF-1 moderation semantics — soft-hide, never delete).
    """
    raw = post.upvotes if raw_score is None else raw_score
    if raw <= AUTO_HIDE_THRESHOLD and not post.is_hidden:
        post.is_hidden = True
        if not post.hidden_reason:
            post.hidden_reason = "auto-hidden by community feedback"
    post.upvotes = effective_score(raw)
    return post


def weekly_window(now=None):
    """The rolling last-7-days window (RAT-9: 'weekly reset' as a rolling
    week — deterministic, no timezone-corner reset task needed)."""
    now = now or timezone.now()
    return now - timedelta(days=7), now


def weekly_rows(limit: int = 50):
    """Per-user solves + points inside the weekly window.

    One SQL pass over submissions in the window, mirroring the main
    aggregation's scoring rule (points once per (user, problem), sum of
    that problem's test points).
    """
    from problems.models import TestCase

    start, _end = weekly_window()
    solves = (
        Submission.objects.filter(
            verdict=Submission.VerdictStatus.ACCEPTED,
            problem__status=Problem.ProblemStatus.APPROVED,
            submission_time__gte=start,
        )
        .values("user_id", "user__username", "problem_id")
        .distinct()
    )
    points_map = {
        row["problem_id"]: int(row["points"] or 0)
        for row in TestCase.objects.values("problem_id").annotate(
            points=Sum("points")
        )
    }
    totals: dict[int, dict] = {}
    for row in solves:
        entry = totals.setdefault(
            row["user_id"],
            {"user_id": row["user_id"], "username": row["user__username"], "solved": 0, "points": 0},
        )
        entry["solved"] += 1
        entry["points"] += points_map.get(row["problem_id"], 0)
    ranked = sorted(
        totals.values(),
        key=lambda e: (-e["points"], -e["solved"], e["username"]),
    )
    for position, entry in enumerate(ranked[:limit], start=1):
        entry["rank"] = position
    return ranked[:limit]


#: RAT-8 honor weights — pure derivation, no new write path.
HONOR_WEIGHTS = {
    "approved_problem": 10,
    "approved_community_editorial": 5,
    "approved_article": 5,
    "post_upvote": 1,
}


def user_honor(user) -> dict:
    """Contributor honor: rewards exactly the authoring behaviors a small
    bilingual judge depends on (RO/EN authoring + verification + helpful
    forum answers)."""
    if user is None or not getattr(user, "is_authenticated", False):
        return {
            "honor": 0,
            "breakdown": {key: 0 for key in HONOR_WEIGHTS},
            "weights": HONOR_WEIGHTS,
        }
    problems = Problem.objects.filter(
        author=user, status=Problem.ProblemStatus.APPROVED
    ).count()
    editorials = CommunityEditorial.objects.filter(
        author=user, status=CommunityEditorial.Status.APPROVED
    ).count()
    articles = Article.objects.filter(
        author=user, status=Article.Status.APPROVED
    ).count()
    # Post upvotes: net-positive posts only, capped per post at 10 so one
    # viral answer cannot dominate the counter (Codewars-style damping).
    upvote_sum = (
        Post.objects.filter(author=user, upvotes__gt=0).aggregate(
            total=Sum("upvotes")
        )["total"]
        or 0
    )
    post_count = Post.objects.filter(author=user, upvotes__gt=0).count()
    capped_upvotes = min(upvote_sum, post_count * 10) if post_count else 0

    breakdown = {
        "approved_problem": problems,
        "approved_community_editorial": editorials,
        "approved_article": articles,
        "post_upvote": capped_upvotes,
    }
    honor = sum(
        breakdown[key] * HONOR_WEIGHTS[key] for key in HONOR_WEIGHTS
    )
    return {
        "honor": honor,
        "breakdown": breakdown,
        "weights": HONOR_WEIGHTS,
    }


def can_browse_solutions(user, problem) -> tuple[bool, str]:
    """COM-7 visibility: after the viewer's own AC (or as author/verifier/
    staff), browse others' AC sources. Contest-fresh problems stay locked
    until the contest fully ends (the archive gate already blocks PRACTICE
    submissions; this blocks the read side too)."""
    from contests.gating import practice_blocked_reason

    if user is not None and getattr(user, "is_authenticated", False):
        if (
            user.is_superuser
            or user.is_staff
            or getattr(user, "role", "") == "ADMIN"
            or problem.author_id == user.id
            or problem.verifier_id == user.id
        ):
            return True, ""
    blocked = practice_blocked_reason(problem, user)
    if blocked:
        return False, blocked
    has_ac = (
        Submission.objects.filter(
            user=user,
            problem=problem,
            verdict=Submission.VerdictStatus.ACCEPTED,
        ).exists()
        if user is not None and getattr(user, "is_authenticated", False)
        else False
    )
    if not has_ac:
        return False, "Solve the problem first to browse community solutions."
    return True, ""


def recent_feed(limit: int = 25):
    """COM-3: the public activity feed — verdict metadata only, code never
    included (the serializer is metadata-only by construction)."""
    rows = (
        Submission.objects.filter(
            problem__status=Problem.ProblemStatus.APPROVED
        )
        .exclude(user__is_minor=True)  # LEG-2: minors stay out of public feeds
        .select_related("user", "problem")
        .order_by("-submission_time")[:limit]
    )
    return [
        {
            "id": row.id,
            "user": row.user.username,
            "problem": {"id": row.problem_id, "title_i18n": row.problem.title_i18n},
            "language": row.language,
            "verdict": row.verdict,
            "score": row.score,
            "submission_time": row.submission_time,
        }
        for row in rows
    ]
