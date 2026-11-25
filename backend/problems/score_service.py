"""User score service (problem-page experience wave, items C/F/G).

The single source of truth for "how many points has this user earned":

- per problem: the BEST submission score (a submission passing k of n
  tests earns the passed tests' points — item C; the best attempt is the
  one that counts),
- problems the user forfeited (source-code unlock before solving — item F)
  contribute ZERO forever,
- the user total is the sum over problems; the leaderboard (D-B8) ranks
  on it and the next gamification wave builds on this module rather than
  re-deriving the rule.
"""

from django.db.models import Max, Q, Sum

from problems.models import Problem, ProblemForfeit, TestCase
from submissions.models import Submission

_AC = Q(verdict=Submission.VerdictStatus.ACCEPTED)
_APPROVED = Q(problem__status=Problem.ProblemStatus.APPROVED)


def problem_point_value(problem: Problem) -> int:
    """The problem's finite point value: the live sum of its test points.

    ``Problem.target_points`` is the author's declared total; the awarded
    denominator is what the tests actually sum to (kept honest by the
    authoring UI's sum-vs-target warning).
    """
    agg = TestCase.objects.filter(problem=problem).aggregate(p=Sum("points"))
    return int(agg["p"] or 0)


def earned_points(user_id: int, problem: Problem) -> int:
    """Best score this user has earned on one problem (0 when forfeited)."""
    if ProblemForfeit.objects.filter(user_id=user_id, problem=problem).exists():
        return 0
    agg = Submission.objects.filter(
        _APPROVED, user_id=user_id, problem=problem
    ).aggregate(best=Max("score"))
    return int(agg["best"] or 0)


def has_solved(user_id: int, problem_id: int) -> bool:
    """True when the user has at least one AC on the problem."""
    return Submission.objects.filter(
        _AC, _APPROVED, user_id=user_id, problem_id=problem_id
    ).exists()


def user_total_score(user_id: int) -> int:
    """Sum of best-per-problem earned points, excluding forfeited problems."""
    forfeited = ProblemForfeit.objects.filter(user_id=user_id).values("problem_id")
    best = (
        Submission.objects.filter(_APPROVED, user_id=user_id)
        .exclude(problem_id__in=forfeited)
        .values("problem_id")
        .annotate(best=Max("score"))
    )
    return sum(int(row["best"] or 0) for row in best)


def solved_problem_ids(user_id: int) -> set[int]:
    """The user's AC'd problem ids (status facet for the catalog, item H)."""
    return set(
        Submission.objects.filter(_AC, _APPROVED, user_id=user_id).values_list(
            "problem_id", flat=True
        )
    )


def attempted_problem_ids(user_id: int) -> set[int]:
    """Problems the user submitted to without an AC (catalog facet, item H)."""
    solved = solved_problem_ids(user_id)
    attempted = set(
        Submission.objects.filter(_APPROVED, user_id=user_id).values_list(
            "problem_id", flat=True
        )
    )
    return attempted - solved
