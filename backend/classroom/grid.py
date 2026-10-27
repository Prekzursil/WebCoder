"""Per-student progress grid over counted submissions (EDU-5).

The matrix is computed on demand from per-test-scored submissions that
satisfy the EDU-3 association rule — no new write path, no state to keep in
sync. ``csv_grid`` (export.py) serializes exactly this shape.
"""

from collections import defaultdict

from submissions.models import Submission


def assignment_grid(assignment) -> dict:
    """Build the students × problems matrix for *assignment*.

    Returns ``{"students": […], "problems": […], "cells": {(user_id,
    problem_id): cell}}`` where a cell is ``None`` (no counted submission)
    or ``{"best_score", "attempts", "last_attempt_at", "verdict", "late"}``.

    Cell semantics:
    - ``attempts`` — every counted submission (any verdict), per EDU-3.
    - ``best_score`` — max ``score`` among counted submissions (scored
      judged submissions carry a float score; pending ones count as 0).
    - ``verdict`` — the verdict of the best-counted submission (highest
      score, ties broken by the latest).
    - ``late`` — whether the best-counted submission fell in the late window.
    """
    memberships = list(
        assignment.classroom.memberships.select_related("student").order_by(
            "student__username"
        )
    )
    problems = list(
        assignment.assignment_problems.select_related("problem").order_by(
            "order", "id"
        )
    )

    students = [m.student for m in memberships]
    if not students or not problems:
        return {"students": students, "problems": problems, "cells": {}}

    submissions = Submission.objects.filter(
        user__in=[s.id for s in students],
        problem__in=[ap.problem_id for ap in problems],
        submission_time__gte=assignment.available_from,
        submission_time__lte=assignment.effective_due_at,
    ).order_by("submission_time")

    # (student_id, problem_id) -> counted submissions grouped
    # The queryset bounds above already implement the EDU-3 association
    # window; everything it yields counts.
    grouped: dict[tuple[int, int], list[Submission]] = defaultdict(list)
    for sub in submissions:
        grouped[(sub.user_id, sub.problem_id)].append(sub)

    cells: dict[tuple[int, int], dict] = {}
    for key, subs in grouped.items():
        best = max(
            subs, key=lambda s: ((s.score if s.score is not None else 0), s.submission_time)
        )
        best_score = best.score if best.score is not None else 0
        cells[key] = {
            "best_score": best_score,
            "attempts": len(subs),
            "last_attempt_at": subs[-1].submission_time,
            "verdict": best.verdict,
            "late": assignment.association(best.submission_time) == "LATE",
        }

    return {"students": students, "problems": problems, "cells": cells}
