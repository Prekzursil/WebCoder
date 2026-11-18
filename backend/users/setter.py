"""Setter CVs + shareable solve cards (wave F items 70-71).

- ``setter_cv`` — the derived authoring portfolio (approved problems by
  difficulty, editorial/article credits, contest-setting credits) plus the
  author-editable ``SetterProfile`` blurb and links.
- ``solve_card`` — the deterministic solve-card payload rendered as an SVG
  by the view (username, problem, solve ordinal, date).
"""

from __future__ import annotations

from contests.models import ContestProblem
from problems.models import Article, CommunityEditorial, Problem


def setter_cv(user) -> dict:
    """The public setter portfolio (item 70)."""
    approved = Problem.objects.filter(
        author=user, status=Problem.ProblemStatus.APPROVED
    )
    by_difficulty = {"EASY": 0, "MEDIUM": 0, "HARD": 0}
    for problem in approved:
        if problem.difficulty in by_difficulty:
            by_difficulty[problem.difficulty] += 1
    editorials = CommunityEditorial.objects.filter(
        author=user, status=CommunityEditorial.Status.APPROVED
    ).count()
    articles = Article.objects.filter(
        author=user, status=Article.Status.APPROVED
    ).count()
    contest_ids = set(
        ContestProblem.objects.filter(
            problem__in=approved.values_list("id", flat=True)
        ).values_list("contest_id", flat=True)
    )
    profile = getattr(user, "setter_profile", None)
    return {
        "username": user.username,
        "blurb": profile.blurb if profile else "",
        "links": profile.links if profile else [],
        "problems_approved": approved.count(),
        "problems_by_difficulty": by_difficulty,
        "community_editorials": editorials,
        "articles": articles,
        "contests_contributed": len(contest_ids),
        "member_since": user.date_joined,
    }


def solve_ordinal(problem_id: int) -> int:
    """1-based solve ordinal of a problem (the Nth solver overall)."""
    from submissions.models import Submission

    return (
        Submission.objects.filter(
            problem_id=problem_id, verdict=Submission.VerdictStatus.ACCEPTED
        )
        .values_list("user_id")
        .distinct()
        .count()
    )


def solve_card(user, problem) -> dict:
    """The deterministic share-card payload (item 71)."""
    solved_at = None
    from submissions.models import Submission

    first = (
        Submission.objects.filter(
            user=user,
            problem=problem,
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        .order_by("submission_time")
        .first()
    )
    if first is not None:
        solved_at = first.submission_time
    title = (
        problem.title_i18n.get("en", f"Problem {problem.id}")
        if isinstance(problem.title_i18n, dict)
        else f"Problem {problem.id}"
    )
    return {
        "username": user.username,
        "problem_id": problem.id,
        "problem_title": title,
        "difficulty": problem.difficulty,
        "ordinal": solve_ordinal(problem.id),
        "solved_at": solved_at,
    }
