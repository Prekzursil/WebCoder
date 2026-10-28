"""Statement revision history + import-source helpers (UXP-4 / CNT-2)."""

from django.db import transaction

from .models import Problem, StatementRevision


def _statement_snapshot(problem: Problem) -> tuple:
    return (
        problem.title_i18n if isinstance(problem.title_i18n, dict) else {},
        problem.statement_i18n if isinstance(problem.statement_i18n, dict) else {},
    )


def record_revision(problem: Problem, edited_by=None, note: str = "") -> None:
    """Write one revision row when the statement materially changed.

    Called from the problem save path; a no-op when neither title nor
    statement moved (metadata-only saves stay out of the history).
    """
    title, statement = _statement_snapshot(problem)
    latest = (
        StatementRevision.objects.filter(problem=problem)
        .order_by("-created_at")
        .first()
    )
    if latest is not None:
        if latest.title_i18n == title and latest.statement_i18n == statement:
            return
    StatementRevision.objects.create(
        problem=problem,
        title_i18n=title,
        statement_i18n=statement,
        edited_by=edited_by,
        note=note,
    )


def changed_since(problem: Problem, since) -> bool:
    """Whether the statement changed after *since* (UXP-4 banner input)."""
    if since is None:
        return False
    return StatementRevision.objects.filter(
        problem=problem, created_at__gt=since
    ).exists()


def statement_history(problem: Problem, limit: int = 20):
    """The public revision feed (newest first, capped)."""
    return list(
        StatementRevision.objects.filter(problem=problem)
        .select_related("edited_by")
        .order_by("-created_at")[:limit]
    )
