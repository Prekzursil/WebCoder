"""Wave E items 13/20/24 — submission-UX endpoints.

- :class:`RandomProblemView` (item 24): one problem from the caller's
  VISIBLE pool, optionally narrowed by difficulty/tag — the "surprise me"
  discovery affordance every catalog has.
- Scratch receipts (item 20): the caller's own ScratchRun + StressRun
  audit rows — what the sandbox executed for you, when, and how it went
  (transparency page; the throttle was always the guard, this is the
  receipt).
"""

import random

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Problem
from webcoder_api.pagination import StandardPageNumberPagination


def _visible_pool(user):
    """Mirror of ProblemViewSet.get_queryset visibility (APPROVED + own
    drafts for authors; staff/verifier see all)."""
    if user.is_authenticated and (
        user.is_staff or getattr(user, "role", "") in ("ADMIN", "VERIFIER")
    ):
        return Problem.objects.all()
    if user.is_authenticated:
        from django.db.models import Q

        return Problem.objects.filter(
            Q(status=Problem.ProblemStatus.APPROVED)
            | Q(
                author=user,
                status__in=[
                    Problem.ProblemStatus.DRAFT,
                    Problem.ProblemStatus.PENDING_APPROVAL,
                ],
            )
        ).distinct()
    return Problem.objects.filter(status=Problem.ProblemStatus.APPROVED)


class RandomProblemView(APIView):
    """GET /api/v1/problems/random/?difficulty=&tag= (item 24).

    Returns {id, title_i18n} of one uniformly-random problem from the
    caller's visible pool (deterministic per request; empty pool → 404
    with a reason instead of a broken die).
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        pool = _visible_pool(request.user)
        difficulty = request.query_params.get("difficulty")
        if difficulty:
            pool = pool.filter(difficulty=difficulty)
        tag = request.query_params.get("tag")
        if tag:
            pool = pool.filter(tags__slug=tag)
        ids = list(pool.values_list("id", "title_i18n"))
        if not ids:
            return Response(
                {"detail": "No problem matches that filter."},
                status=status.HTTP_404_NOT_FOUND,
            )
        row_id, title = random.choice(ids)  # noqa: S311 — discovery, not crypto
        return Response({"id": row_id, "title_i18n": title})


class MyScratchReceiptsView(APIView):
    """GET /api/v1/scratch/mine/ (item 20): the caller's sandbox receipts —
    scratch runs and stress runs merged, newest first, paginated."""

    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardPageNumberPagination

    def get(self, request):
        from scratch.models import ScratchRun, StressRun

        rows = []
        for run in ScratchRun.objects.filter(user=request.user)[:200]:
            rows.append(
                {
                    "kind": "scratch",
                    "id": run.id,
                    "language": run.language,
                    "status": run.status,
                    "time_ms": run.execution_time_ms,
                    "memory_kb": run.memory_used_kb,
                    "created_at": run.created_at,
                }
            )
        for run in StressRun.objects.filter(user=request.user)[:200]:
            rows.append(
                {
                    "kind": "stress",
                    "id": run.id,
                    "language": "",
                    "status": "FOUND" if run.found else "CLEAN",
                    "time_ms": None,
                    "memory_kb": None,
                    "created_at": run.created_at,
                }
            )
        rows.sort(key=lambda r: r["created_at"], reverse=True)
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(rows, request)
        return paginator.get_paginated_response(page)
