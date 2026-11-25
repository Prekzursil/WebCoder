"""Federated search (wave G item 82).

``GET /api/v1/search/?q=…`` — one query across the site's public
surfaces, grouped and capped per kind so a single keystroke-length query
can never flood the response:

- problems  — APPROVED, title or statement match (the catalog ?search=
  semantics), 5 hits
- threads   — forum titles (hidden threads excluded), 5 hits
- articles  — APPROVED lecture layer titles, 3 hits
- contests  — PUBLIC contests, 3 hits
- users     — public handles, 5 hits

Anonymous-friendly (everything here is already public), default anon
throttle. The Ctrl-K palette consumes it (item 80 ships the surface; this
fills it with federated results).
"""

from django.db.models import Q
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from contests.models import Contest
from forum.models import Thread
from problems.models import Article, Problem

from users.models import User

#: Per-kind caps — the response stays bounded for any query length.
LIMITS = {"problems": 5, "threads": 5, "articles": 3, "contests": 3, "users": 5}
MIN_QUERY_LEN = 2


def _i18n_text(value, locale: str = "en") -> str:
    if isinstance(value, dict):
        return (value.get(locale) or value.get("en") or value.get("ro") or "").strip()
    return str(value or "")


class FederatedSearchView(APIView):
    """Grouped site search (wave G item 82)."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "anon"

    def get(self, request):
        locale = request.query_params.get("lang", "en")
        if locale not in ("en", "ro"):
            locale = "en"
        query = (request.query_params.get("q") or "").strip()
        if len(query) < MIN_QUERY_LEN:
            return Response({"query": query, "results": {}})

        like = Q()
        # Bilingual fields are JSON dicts — match either language's text.
        for field in ("title_i18n", "statement_i18n"):
            like |= Q(**{f"{field}__icontains": query})
        problems = (
            Problem.objects.filter(status=Problem.ProblemStatus.APPROVED)
            .filter(like)
            .order_by("-id")[: LIMITS["problems"]]
        )

        threads = Thread.objects.filter(
            is_hidden=False, title__icontains=query
        ).order_by("-last_activity")[: LIMITS["threads"]]

        articles = (
            Article.objects.filter(status=Article.Status.APPROVED)
            .filter(
                Q(title_i18n__icontains=query)
                | Q(body_en__icontains=query)
                | Q(body_ro__icontains=query)
            )
            .order_by("-id")[: LIMITS["articles"]]
        )

        contests = (
            Contest.objects.filter(visibility=Contest.Visibility.PUBLIC)
            .filter(title_i18n__icontains=query)
            .order_by("-start_at")[: LIMITS["contests"]]
        )

        users = User.objects.filter(is_active=True, username__icontains=query).order_by(
            "username"
        )[: LIMITS["users"]]

        results = {
            "problems": [
                {
                    "id": p.id,
                    "title": _i18n_text(p.title_i18n, locale) or f"#{p.id}",
                    "difficulty": p.difficulty,
                }
                for p in problems
            ],
            "threads": [
                {"id": t.id, "title": t.title, "problem": t.problem_id} for t in threads
            ],
            "articles": [
                {"id": a.id, "title": _i18n_text(a.title_i18n, locale) or f"#{a.id}"}
                for a in articles
            ],
            "contests": [
                {
                    "id": c.id,
                    "title": _i18n_text(c.title_i18n, locale) or f"#{c.id}",
                    "start_at": c.start_at,
                }
                for c in contests
            ],
            "users": [{"id": u.id, "username": u.username} for u in users],
        }
        # [wave G item 110] search analytics: log the invocation with the
        # real per-kind counts (best-effort — never breaks the search).
        from analytics.views import log_search

        log_search(query, results, request.user)
        return Response({"query": query, "results": results})
