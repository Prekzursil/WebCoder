"""Score aggregation for the judge's scoring modes (competitive roadmap J6).

Aggregation rules:
- PARTIAL_PER_TEST: sum of passed test points (the historical behaviour).
- BINARY: every test passes -> full score, else 0.
- SUBTASKS: tests sharing a non-empty ``TestCase.subtask`` key pass or fail
  together; a group's points (its first member's points value — members are
  expected to carry equal points) are awarded only when every member passes.
  Ungrouped tests score individually.

``recompute_full_score`` is the TestCase post_save/post_delete signal that
keeps ``Problem.full_score`` cached.
"""

from collections import OrderedDict

from .models import Problem, TestCase


def group_tests(test_cases):
    """Split an ordered test list into (ungrouped, groups) where groups is
    an OrderedDict of subtask key -> list of tests (insertion order)."""
    ungrouped = []
    groups = OrderedDict()
    for tc in test_cases:
        if tc.subtask:
            groups.setdefault(tc.subtask, []).append(tc)
        else:
            ungrouped.append(tc)
    return ungrouped, groups


def full_score_for(test_cases):
    """Total denominator for a problem's test list."""
    ungrouped, groups = group_tests(test_cases)
    total = sum(tc.points for tc in ungrouped)
    for members in groups.values():
        total += members[0].points
    return total


def recompute_full_score(sender, instance, **kwargs):
    """Signal receiver: refresh the owning problem's cached full_score."""
    Problem.objects.filter(pk=instance.problem_id).update(
        full_score=full_score_for(
            TestCase.objects.filter(problem_id=instance.problem_id).order_by(
                "order", "id"
            )
        )
    )


def aggregate_score(scoring_mode, test_results):
    """Aggregate ``(test_case, passed)`` pairs into (score, full_score).

    ``test_results`` is an iterable of (TestCase, passed: bool) in execution
    order.
    """
    ordered = list(test_results)
    full = full_score_for([tc for tc, _ in ordered])
    if scoring_mode == Problem.ScoringMode.BINARY:
        return (full if ordered and all(ok for _, ok in ordered) else 0), full
    if scoring_mode == Problem.ScoringMode.SUBTASKS:
        ungrouped, groups = group_tests([tc for tc, _ in ordered])
        passed = {id(tc): ok for tc, ok in ordered}
        score = sum(tc.points for tc in ungrouped if passed[id(tc)])
        for members in groups.values():
            if all(passed[id(tc)] for tc in members):
                score += members[0].points
        return score, full
    # PARTIAL_PER_TEST (default)
    return sum(tc.points for tc, ok in ordered if ok), full
