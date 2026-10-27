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


def _normalized(test_results):
    """(tc, passed, fraction) triples from 2- or 3-tuples.

    ``fraction`` (checker protocol v2 / J7) is None for plain outcomes
    and a 0..1 float for exit-7 partial awards; it only ever credits
    points, never flips ``passed``.
    """
    out = []
    for entry in test_results:
        tc, ok = entry[0], entry[1]
        fraction = entry[2] if len(entry) > 2 else None
        if not ok:
            fraction = None  # a failed test never carries partial credit
        elif fraction is not None:
            fraction = min(max(fraction, 0.0), 1.0)
        out.append((tc, ok, fraction))
    return out


def _full_pass(ok, fraction):
    """A test fully passes only when accepted at full credit (J7: a
    partial award must not satisfy BINARY/SUBTASKS all-pass rules)."""
    return ok and (fraction is None or fraction >= 1.0)


def _credit(tc, ok, fraction):
    """Points credited by one test under PARTIAL_PER_TEST semantics."""
    if fraction is not None:
        return tc.points * fraction
    return tc.points if ok else 0


def aggregate_score(scoring_mode, test_results):
    """Aggregate per-test outcomes into (score, full_score).

    ``test_results`` is an iterable of ``(TestCase, passed)`` pairs or
    ``(TestCase, passed, fraction)`` triples (checker protocol v2 / J7:
    ``fraction`` scales the test's points under PARTIAL_PER_TEST) in
    execution order.
    """
    ordered = _normalized(test_results)
    full = full_score_for([tc for tc, _, _ in ordered])
    if scoring_mode == Problem.ScoringMode.BINARY:
        all_full = ordered and all(_full_pass(ok, f) for _, ok, f in ordered)
        return (full if all_full else 0), full
    if scoring_mode == Problem.ScoringMode.SUBTASKS:
        ungrouped, groups = group_tests([tc for tc, _, _ in ordered])
        outcome = {id(tc): (ok, f) for tc, ok, f in ordered}
        # Ungrouped tests score individually (partial credit allowed);
        # a subtask group is all-or-nothing at FULL credit per member.
        score = sum(
            _credit(tc, *outcome[id(tc)]) for tc in ungrouped
        )
        for members in groups.values():
            if all(_full_pass(*outcome[id(tc)]) for tc in members):
                score += members[0].points
        return score, full
    # PARTIAL_PER_TEST (default)
    return sum(_credit(tc, ok, f) for tc, ok, f in ordered), full
