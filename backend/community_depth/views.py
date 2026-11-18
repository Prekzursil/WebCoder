"""Community-depth API surface (Wave C: COM-3/COM-7, RAT-8/9/10).

Mounted under /api/v1/community/ — a thin read layer; all logic lives in
``community_depth.services`` (pure, testable, 100%-coverable without HTTP).
"""

from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from problems.models import Problem
from submissions.models import Submission

from . import services

User = get_user_model()

#: The license note COM-7 rides on every solutions payload — the ToS
#: grant ("code stays the author's; the platform may display it").
SOLUTIONS_LICENSE_NOTE = (
    "Code stays the author's; the platform displays it under the Terms "
    "of Service submission grant."
)


class FeedView(APIView):
    """GET /community/feed/ — COM-3 public recent verdicts (no code).

    Public + cached-friendly; the DMOJ home-activity pattern. Pagination
    is fixed-window (page param) over the newest N rows.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            page = int(request.query_params.get("page", "1"))
        except ValueError:
            page = 1
        page = max(1, page)
        per_page = 25
        rows = services.recent_feed(limit=per_page * page)
        # Item 65 — the following filter: only the people the caller
        # follows (ignored for anonymous callers — the full feed stays).
        following = request.query_params.get("following", "") in ("1", "true")
        if following and request.user.is_authenticated:
            from users.models import Follow

            followed = set(
                Follow.objects.filter(follower=request.user).values_list(
                    "target_id", flat=True
                )
            )
            rows = [row for row in rows if row.get("user_id") in followed]
        window = rows[(page - 1) * per_page : page * per_page]
        return Response(
            {
                "count": len(window),
                "page": page,
                "results": window,
                "next": page + 1 if len(rows) == per_page * page else None,
            }
        )


class SolutionsView(APIView):
    """GET /community/problems/{problem_id}/solutions/ — COM-7 post-solve
    browsing of others' AC sources, gated by the viewer's own AC."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, problem_id):
        from django.shortcuts import get_object_or_404

        problem = get_object_or_404(Problem, pk=problem_id)
        ok, reason = services.can_browse_solutions(request.user, problem)
        if not ok:
            return Response({"detail": reason}, status=status.HTTP_403_FORBIDDEN)
        qs = (
            Submission.objects.filter(
                problem=problem, verdict=Submission.VerdictStatus.ACCEPTED
            )
            .exclude(user__is_minor=True)  # LEG-2: no minors' code in the pool
            .select_related("user")
        )
        # Wave E item 11 (accepted-solutions showcase): the browsing pool
        # gains the showcase axis — sort by speed (the DMOJ/infoarena
        # "best solutions" board), by code length (shortest readable) or
        # by recency — plus a language filter.
        language = request.query_params.get("language")
        if language:
            qs = qs.filter(language=language)
        sort = request.query_params.get("sort", "fastest")
        if sort == "shortest":
            from django.db.models.functions import Length

            qs = qs.annotate(code_len=Length("code")).order_by(
                "code_len", "submission_time"
            )
        elif sort == "newest":
            qs = qs.order_by("-submission_time")
        else:
            # Matrix row 60 (best-solutions ranking): fastest-first; ties
            # break on the older submission.
            qs = qs.order_by("execution_time_ms", "submission_time")
        rows = qs[:50]
        return Response(
            {
                "count": len(rows),
                "license": SOLUTIONS_LICENSE_NOTE,
                "sort": sort,
                "language": language or "",
                "results": [
                    {
                        "id": row.id,
                        "user": row.user.username,
                        "language": row.language,
                        "code": row.code,
                        "code_length": len(row.code),
                        "execution_time_ms": row.execution_time_ms,
                        "memory_used_kb": row.memory_used_kb,
                        "submission_time": row.submission_time,
                        # Item 61 — the author-chosen sharing license.
                        "license": row.license,
                    }
                    for row in rows
                ],
            }
        )


class HonorView(APIView):
    """GET /community/honor/{username}/ — RAT-8 contributor honor."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, username):
        user = User.objects.filter(username=username).first()
        if user is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        payload = services.user_honor(user)
        payload["username"] = user.username
        return Response(payload)


class MyHonorView(APIView):
    """GET /community/honor/me/ — the caller's own honor (denser client
    contract for the profile strip)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        payload = services.user_honor(request.user)
        payload["username"] = request.user.username
        return Response(payload)


class WeeklyLeaderboardView(APIView):
    """GET /community/leaderboard/weekly/ — RAT-9: solves + points inside
    the rolling 7-day window, the mid-tier-friendly reset board."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        rows = services.weekly_rows(limit=50)
        return Response(
            {
                "count": len(rows),
                "window_days": 7,
                "results": rows,
            }
        )
