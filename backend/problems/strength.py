"""Testcase strength scoring (wave E item 16).

How well does a test suite catch WRONG solutions? The honest, computable
answer from data the judge already stores: every submission whose final
verdict is not AC is a "known-wrong" solution (some part of it failed the
suite); a test's **catch rate** is the share of those known-wrong
solutions it personally failed. A test every wrong solution fails is a
strong test; a test no wrong solution fails is dead weight — samples
usually land here, which is expected and now visible.

``suite_strength`` is the mean catch rate across non-sample tests (0-1);
with no wrong submissions yet the endpoint says ``calibrated: false``
instead of inventing a number.

Read-only aggregation over SubmissionTestResult; gated to the problem's
author, VERIFIER and ADMIN (it reasons about other users' submissions).
"""

from django.db.models import Count, Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Problem
from submissions.models import Submission

AC = Submission.VerdictStatus.ACCEPTED


class TestStrengthView(APIView):
    """GET /api/v1/problems/{problem_id}/test-strength/ (item 16)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, problem_id: int):
        problem = Problem.objects.filter(pk=problem_id).first()
        if problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        allowed = (
            request.user.is_superuser
            or request.user.is_staff
            or getattr(request.user, "role", "") in ("ADMIN", "VERIFIER")
            or problem.author_id == request.user.pk
        )
        if not allowed:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        tests = list(problem.test_cases.order_by("order"))
        # Known-wrong solutions: submissions that reached a terminal,
        # non-AC verdict (CE excluded — they never ran a single test).
        wrong_ids = list(
            Submission.objects.filter(problem=problem)
            .exclude(verdict=AC)
            .exclude(verdict__in=["PENDING", "COMPILING", "RUNNING", "CE"])
            .values_list("id", flat=True)
        )
        rows = (
            problem.test_cases.filter(submission_results__submission_id__in=wrong_ids)
            .annotate(
                caught=Count(
                    "submission_results",
                    filter=~Q(submission_results__verdict=AC),
                ),
            )
            .values("id", "caught")
        )
        caught_by_test = {row["id"]: row["caught"] for row in rows}
        total_wrong = len(wrong_ids)

        results = []
        hidden_scores = []
        for tc in tests:
            caught = caught_by_test.get(tc.id, 0)
            rate = round(caught / total_wrong, 4) if total_wrong else None
            if not tc.is_sample and rate is not None:
                hidden_scores.append(rate)
            results.append(
                {
                    "test_id": tc.id,
                    "order": tc.order,
                    "is_sample": tc.is_sample,
                    "subtask": tc.subtask,
                    "points": tc.points,
                    "time_limit_ms": tc.time_limit_ms,
                    "wrong_solutions": total_wrong,
                    "caught": caught,
                    "catch_rate": rate,
                }
            )
        suite_strength = (
            round(sum(hidden_scores) / len(hidden_scores), 4) if hidden_scores else None
        )
        return Response(
            {
                "problem_id": problem.pk,
                "calibrated": total_wrong > 0,
                "wrong_solutions": total_wrong,
                "suite_strength": suite_strength,
                "tests": results,
            }
        )
