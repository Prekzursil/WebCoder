"""Test-management API (problem-page experience wave, item B).

- ``POST /problems/{id}/tests/import-archive/``  upload a .zip/.tar/.tar.gz
  of tests; auto-pairs inputs/answers, previews the parsed pairs, and
  (unless ``dry_run``) bulk-creates TestCases. Bomb/traversal guards in
  ``test_archive.py``.
- ``POST /problems/{id}/tests/distribute/``      redistribute the points
  across the problem's tests so they sum to a target (default: the
  problem's declared point value).
"""

from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Problem, TestCase
from .test_archive import parse_archive


def _may_manage(request, problem: Problem) -> bool:
    """The problem's own edit gate: author, verifier, admin (2FA-enforced
    upstream by the role gates on the authoring endpoints)."""
    user = request.user
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    from users.models import User

    if (
        user.is_superuser
        or user.is_staff
        or getattr(user, "role", "") in (User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER)
    ):
        return True
    return problem.author_id == user.id


def _guard_contest_pin(problem, user):
    """Reuse the viewset's pin guard (CON-1) so an import cannot mutate a
    problem sitting on a live contest board."""
    from .views import _guard_contest_pin as _guard

    _guard(problem, user)


class ImportArchiveView(APIView):
    """Upload an archive of tests; preview + bulk-create."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, problem_id: int):
        problem = Problem.objects.filter(id=problem_id).first()
        if problem is None:
            return Response({"detail": "problem not found"}, status=404)
        if not _may_manage(request, problem):
            return Response({"detail": "not allowed"}, status=403)
        upload = request.data.get("archive")
        if upload is None:
            return Response({"detail": "archive file required"}, status=400)
        raw = upload.read()
        try:
            parsed = parse_archive(upload.name or "", raw)
        except Exception as exc:
            # Only the parser's self-authored messages surface (args[0] /
            # message_dict) — never str(exc), which could carry
            # interpreter internals (CodeQL: information exposure).
            message_dict = getattr(exc, "message_dict", None)
            detail = message_dict or exc.args[0] if exc.args else "invalid archive"
            return Response({"detail": detail}, status=400)
        pairs = parsed["pairs"]
        if not pairs:
            return Response(
                {
                    "detail": "no input/answer pairs found in the archive",
                    "skipped": parsed["skipped"],
                    "other_files": parsed["other_files"],
                },
                status=400,
            )
        if request.data.get("dry_run") in ("1", "true", "True", True):
            return Response({**parsed, "created": 0})
        _guard_contest_pin(problem, request.user)
        default_points = request.data.get("points")
        try:
            default_points = (
                int(default_points) if default_points not in (None, "") else 10
            )
        except (TypeError, ValueError):
            return Response({"detail": "points must be an integer"}, status=400)
        if default_points < 1:
            return Response({"detail": "points must be >= 1"}, status=400)
        start_order = (
            TestCase.objects.filter(problem=problem)
            .order_by("-order")
            .values_list("order", flat=True)
            .first()
            or 0
        )
        rows = [
            TestCase(
                problem=problem,
                input_data=pair["input"],
                expected_output_data=pair["expected"],
                is_sample=pair["is_sample"],
                points=default_points,
                order=start_order + index + 1,
            )
            for index, pair in enumerate(pairs)
        ]
        TestCase.objects.bulk_create(rows)
        return Response(
            {
                **parsed,
                "created": len(rows),
                "points_each": default_points,
            },
            status=status.HTTP_201_CREATED,
        )


class DistributePointsView(APIView):
    """Evenly redistribute the per-test points toward a target total."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, problem_id: int):
        problem = Problem.objects.filter(id=problem_id).first()
        if problem is None:
            return Response({"detail": "problem not found"}, status=404)
        if not _may_manage(request, problem):
            return Response({"detail": "not allowed"}, status=403)
        tests = list(TestCase.objects.filter(problem=problem).order_by("order", "id"))
        if not tests:
            return Response({"detail": "no tests to distribute over"}, status=400)
        target = request.data.get("target")
        try:
            target = int(target) if target not in (None, "") else problem.target_points
        except (TypeError, ValueError):
            return Response({"detail": "target must be an integer"}, status=400)
        if target < len(tests):
            return Response(
                {
                    "detail": (
                        f"target {target} cannot be split over {len(tests)} tests "
                        f"(each test is worth at least 1 point)"
                    )
                },
                status=400,
            )
        _guard_contest_pin(problem, request.user)
        base, remainder = divmod(target, len(tests))
        total = 0
        for index, test in enumerate(tests):
            test.points = base + (1 if index < remainder else 0)
            total += test.points
        TestCase.objects.bulk_update(tests, ["points"])
        # Keep the cached denominator honest (the signal only fires on
        # save(); bulk_update bypasses it).
        problem.full_score = total
        problem.save(update_fields=["full_score"])
        return Response(
            {
                "target": target,
                "tests": len(tests),
                "total": total,
                "points": [test.points for test in tests],
            }
        )
