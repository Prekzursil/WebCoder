"""Public read-only API v1 (competitive roadmap OPS-1) + Microsoft SSO
(OPS-3). Round-2 slice D.7 keeps the first increment to read-only problems
+ leaderboard + verdict feed (no personal tokens until the OPS-2 2FA
interplay is resolved); throttles follow the SP4 pattern.
"""

from django.conf import settings
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from leaderboard.models import LeaderboardEntry
from problems.models import Problem, Tag
from webcoder_api.pagination import StandardPageNumberPagination

from community_depth import services as community_services

#: OPS-1 documentation line every payload carries — the DMOJ/Codeforces
#: social contract: unauthenticated reads, generous pages, no tokens yet.
PUBLIC_API_NOTICE = (
    "WebCoder public API v1 (read-only). Rate limit: 60/min per IP "
    "(240/min with a personal API token: Authorization: Token <key>)."
)

#: Anon throttle ceiling for the public namespace (SP4 pattern).
PUBLIC_API_RATE = "60/min"

#: Token-authenticated ceiling (OPS-2): personal API tokens act as the
#: public API's "trusted reader" credential at 4x the anon rate.
PUBLIC_API_AUTH_RATE = "240/min"


class PublicAPIThrottle(SimpleRateThrottle):
    """The public namespace's own throttle — a FIXED scope, not view-driven.

    Deliberately NOT a ScopedRateThrottle subclass: ScopedRateThrottle
    re-reads ``view.throttle_scope`` on every request and resets ``scope``
    to None when the view does not define one, which silently disabled
    this throttle entirely (found while wiring OPS-2's authenticated
    rate). Subclassing SimpleRateThrottle with an explicit ``__init__``
    pins the rate to the namespace and keeps the cache key stable.

    OPS-2 (Wave D): requests authenticated with a personal API token
    (``Authorization: Token <key>``) switch to the 4x ``public_api_auth``
    rate — the DMOJ pattern of generous authenticated reads that the
    roadmap's "tokens double as OPS-1 auth" resolves to.
    """

    scope = "public_api"

    def _rate_for(self, scope: str, fallback: str) -> str:
        rates = getattr(settings, "REST_FRAMEWORK", {}).get(
            "DEFAULT_THROTTLE_RATES", {}
        )
        return str(rates.get(scope, fallback))

    def get_rate(self):
        # String form ("60/min") — the SimpleRateThrottle contract; the
        # base __init__/allow_request does the parsing.
        if self.scope == "public_api_auth":
            return self._rate_for("public_api_auth", PUBLIC_API_AUTH_RATE)
        return self._rate_for("public_api", PUBLIC_API_RATE)

    def __init__(self):
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)

    def allow_request(self, request, view):
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            self.scope = "public_api_auth"
            self.rate = self._rate_for("public_api_auth", PUBLIC_API_AUTH_RATE)
            self.num_requests, self.duration = self.parse_rate(self.rate)
        return super().allow_request(request, view)

    def get_cache_key(self, request, view):
        # SimpleRateThrottle leaves this abstract; the ScopedRateThrottle
        # implementation we replaced carried exactly this key shape
        # (authenticated users key by pk, anon by IP).
        if request.user and request.user.is_authenticated:
            ident = request.user.pk
        else:
            ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class PublicProblemList(APIView):
    """GET /public/problems/ — APPROVED problems with taxonomy tags.

    Deliberately lean: id, titles (RO/EN), difficulty, tags, limits — the
    mirror-site / club-dashboard surface the roadmap cites.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [PublicAPIThrottle]
    pagination_class = StandardPageNumberPagination

    def get(self, request):
        qs = (
            Problem.objects.filter(status=Problem.ProblemStatus.APPROVED)
            .prefetch_related("tags")
            .order_by("-creation_date")
        )
        tag = request.query_params.get("tag", "").strip()
        if tag:
            qs = qs.filter(tags__slug=tag)
        difficulty = request.query_params.get("difficulty", "").strip().upper()
        if difficulty in {"VERY_EASY", "EASY", "MEDIUM", "HARD"}:
            qs = qs.filter(difficulty=difficulty)
        search = request.query_params.get("search", "").strip().lower()
        if search:
            from django.db.models import Q

            qs = qs.filter(
                Q(title_i18n__en__icontains=search)
                | Q(title_i18n__ro__icontains=search)
            )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request)
        return paginator.get_paginated_response(
            {
                "api": PUBLIC_API_NOTICE,
                "results": [
                    {
                        "id": problem.id,
                        "title_i18n": problem.title_i18n,
                        "difficulty": problem.difficulty,
                        "tags": [t.slug for t in problem.tags.all()],
                        "time_limit_ms": problem.default_time_limit_ms,
                        "memory_limit_kb": problem.default_memory_limit_kb,
                    }
                    for problem in page
                ],
            }["results"]
        )


class PublicProblemDetail(APIView):
    """GET /public/problems/{id}/ — statement metadata (no test data)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [PublicAPIThrottle]

    def get(self, request, pk):
        from django.shortcuts import get_object_or_404

        problem = get_object_or_404(
            Problem, pk=pk, status=Problem.ProblemStatus.APPROVED
        )
        return Response(
            {
                "api": PUBLIC_API_NOTICE,
                "id": problem.id,
                "title_i18n": problem.title_i18n,
                "statement_i18n": problem.statement_i18n,
                "difficulty": problem.difficulty,
                "tags": [t.slug for t in problem.tags.all()],
                "time_limit_ms": problem.default_time_limit_ms,
                "memory_limit_kb": problem.default_memory_limit_kb,
                "io_mode": problem.io_mode,
                "problem_type": problem.problem_type,
                # Statements only — test data and checkers never serialize.
                "has_editorial": hasattr(problem, "editorial"),
            }
        )


class PublicLeaderboard(APIView):
    """GET /public/leaderboard/ — the all-time standings (first 100 rows)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [PublicAPIThrottle]

    def get(self, request):
        rows = (
            LeaderboardEntry.objects.select_related("user")
            .order_by("-total_points", "-solved_count", "last_solved_at")[:100]
        )
        return Response(
            {
                "api": PUBLIC_API_NOTICE,
                "count": len(rows),
                "results": [
                    {
                        "rank": position,
                        "username": row.user.username,
                        "solved_count": row.solved_count,
                        "total_points": row.total_points,
                        "last_solved_at": row.last_solved_at,
                    }
                    for position, row in enumerate(rows, start=1)
                ],
            }
        )


class PublicFeed(APIView):
    """GET /public/feed/ — the COM-3 verdict stream (no code, ever)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [PublicAPIThrottle]

    def get(self, request):
        return Response(
            {"api": PUBLIC_API_NOTICE, "results": community_services.recent_feed(25)}
        )


class PublicTags(APIView):
    """GET /public/tags/ — the tag facets (club dashboards build filters)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [PublicAPIThrottle]

    def get(self, request):
        tags = Tag.objects.all().order_by("slug")
        return Response(
            {
                "api": PUBLIC_API_NOTICE,
                "count": len(tags),
                "results": [
                    {"slug": t.slug, "name_i18n": t.name_i18n} for t in tags
                ],
            }
        )


class PublicRoot(APIView):
    """GET /public/ — the endpoint directory (Codeforces apiHelp pattern)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [PublicAPIThrottle]

    def get(self, request):
        return Response(
            {
                "api": PUBLIC_API_NOTICE,
                "endpoints": [
                    "/api/v1/public/problems/",
                    "/api/v1/public/problems/{id}/",
                    "/api/v1/public/leaderboard/",
                    "/api/v1/public/feed/",
                    "/api/v1/public/tags/",
                ],
            }
        )

