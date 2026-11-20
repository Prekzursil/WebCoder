"""Incremental test unlocking (problem-page experience wave, item C).

The owner-specified mechanic, distinct from everything shipped before:

    a submission that passes k of n tests earns the passed tests' points
    AND unlocks visibility of test k+1 ONLY — that user can now see test
    k+1's input + expected output to debug. Once they pass k+1 tests,
    test k+2 unlocks, and so on — one test at a time, in order,
    per-user-per-problem. Never reveal beyond the earned index.

Model: ``ProblemUnlockState(user, problem)`` carries ``passed_count`` —
the best number of passed tests any single submission achieved (max, so
a worse later submission never regresses visibility). Positions 1..k are
"solved" for that user, position k+1 is "unlocked" (its input/expected
become visible to that user), everything beyond stays locked. Samples
stay public as always.
"""

from __future__ import annotations

from problems.models import Problem, TestCase


def update_unlock_state(user_id: int, problem_id: int, passed_count: int) -> bool:
    """Fold one judged submission's pass count into the user's row.

    Idempotent and monotone: only a strictly better count writes. Returns
    True when the row advanced (callers may schedule UI refreshes).
    """
    from .models import ProblemUnlockState

    if passed_count <= 0:
        return False
    row = ProblemUnlockState.objects.filter(
        user_id=user_id, problem_id=problem_id
    ).first()
    if row is None:
        ProblemUnlockState.objects.create(
            user_id=user_id, problem_id=problem_id, passed_count=passed_count
        )
        return True
    if passed_count > row.passed_count:
        row.passed_count = passed_count
        row.save(update_fields=["passed_count", "updated_at"])
        return True
    return False


def unlock_state_for(user, problem: Problem) -> dict:
    """The per-viewer unlock summary for the problem detail payload."""
    from .models import ProblemUnlockState

    total = problem.test_cases.count()
    passed = 0
    if user is not None and getattr(user, "is_authenticated", False):
        row = ProblemUnlockState.objects.filter(user=user, problem=problem).first()
        if row is not None:
            passed = row.passed_count
    return {
        "passed_count": passed,
        "unlocked_index": min(passed + 1, total) if total else 0,
        "total": total,
        "solved_all": total > 0 and passed >= total,
    }


def test_status_for(user, problem: Problem) -> list[dict]:
    """Per-test locked/unlocked/solved rows for the problem page.

    Position semantics (1-based, execution order):
    - ``<= passed_count``            SOLVED  (passed; no data unless sample)
    - ``== passed_count + 1``        UNLOCKED (input + expected visible)
    - beyond                         LOCKED
    Samples always expose their data (public statement). Privileged
    viewers (author/verifier/admin) see every test's data marked solved.
    """
    from users.models import User

    privileged = False
    if user is not None and getattr(user, "is_authenticated", False):
        privileged = bool(
            user.is_superuser
            or user.is_staff
            or getattr(user, "role", "")
            in (User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER)
            or problem.author_id == user.id
            or problem.verifier_id == user.id
        )
    state = unlock_state_for(user, problem)
    passed = state["passed_count"]
    rows: list[dict] = []
    tests = problem.test_cases.order_by("order", "id")
    for position, test in enumerate(tests, start=1):
        if privileged:
            status_key = "solved" if position <= passed else "unlocked"
        elif position <= passed:
            status_key = "solved"
        elif position == passed + 1:
            status_key = "unlocked"
        else:
            status_key = "locked"
        show_data = privileged or test.is_sample or status_key == "unlocked"
        rows.append(
            {
                "id": test.id,
                "order": test.order,
                "position": position,
                "points": test.points,
                "is_sample": test.is_sample,
                "status": status_key,
                "input_data": test.input_data if show_data else None,
                "expected_output_data": test.expected_output_data
                if show_data
                else None,
            }
        )
    return rows


def may_view_test(user, test: TestCase) -> bool:
    """Gate for the raw download endpoint: samples, the single unlocked
    boundary test (position == passed_count, 0-based) and everything for
    privileged viewers. Solved-prefix and locked tests stay judge-only —
    data visibility stops at the earned index."""
    from users.models import User

    if test.is_sample:
        return True
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    if (
        user.is_superuser
        or user.is_staff
        or getattr(user, "role", "") in (User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER)
        or test.problem.author_id == user.id
        or test.problem.verifier_id == user.id
    ):
        return True
    from .models import ProblemUnlockState

    row = ProblemUnlockState.objects.filter(
        user=user, problem_id=test.problem_id
    ).first()
    if row is None:
        return False
    position = list(
        test.problem.test_cases.order_by("order", "id").values_list("id", flat=True)
    ).index(test.id)
    return position == row.passed_count
