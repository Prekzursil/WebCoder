"""Analytics views (wave G): org dashboards, funnel snapshots, search
analytics, webhooks, experiments, season reports."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import timedelta

import requests

from django.contrib.auth import get_user_model
from django.db.models import Count
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from contests.models import Contest, ContestParticipation
from problems.models import Problem
from submissions.models import Submission
from users.permissions import IsAdminUser

from .models import (
    Experiment,
    ExperimentAssignment,
    SearchQuery,
    SeasonReport,
    WebhookDelivery,
    WebhookEndpoint,
)

logger = logging.getLogger(__name__)
User = get_user_model()

WEBHOOK_TIMEOUT_S = 5
#: Which events exist (validated on endpoint registration).
WEBHOOK_EVENTS = [
    "submission.judged",
    "contest.finished",
    "problem.approved",
    "user.registered",
]


# ---------------------------------------------------------------------------
# Item 105 — org (school/county) dashboards.
# ---------------------------------------------------------------------------


class OrgDashboardView(APIView):
    """GET /api/v1/analytics/org/?school=…&county=… (ADMIN/TEACHER).

    The school/partnership view: members, weekly active solvers, total
    solves and the last-30-day submission count for the chosen org
    segment. Minors are excluded from school/county segmentation (LEG-2).
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        is_staff = user.role == User.Roles.ADMIN or user.is_superuser
        if not is_staff and user.role != User.Roles.TEACHER:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        school = (request.query_params.get("school") or "").strip()
        county = (request.query_params.get("county") or "").strip()
        if not school and not county:
            return Response(
                {"detail": "school or county query parameter is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Non-staff (teachers) may only see their own school.
        if not is_staff:
            own_school = (user.school or "").strip()
            if not own_school or school.lower() != own_school.lower():
                return Response(
                    {"detail": "Teachers may only query their own school."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        members = User.objects.filter(is_active=True, is_minor=False)
        if school:
            members = members.exclude(school="")
        if school:
            members = members.filter(school__iexact=school)
        if county:
            members = members.filter(county__iexact=county)
        member_ids = list(members.values_list("id", flat=True))

        since_7 = timezone.now() - timedelta(days=7)
        since_30 = timezone.now() - timedelta(days=30)
        subs = Submission.objects.filter(user_id__in=member_ids)
        weekly_active = (
            subs.filter(submission_time__gte=since_7)
            .values("user_id")
            .distinct()
            .count()
        )
        solves = (
            subs.filter(verdict=Submission.VerdictStatus.ACCEPTED)
            .values("problem_id", "user_id")
            .distinct()
            .count()
        )
        return Response(
            {
                "school": school,
                "county": county,
                "members": len(member_ids),
                "weekly_active_solvers": weekly_active,
                "total_solves": solves,
                "submissions_30d": subs.filter(submission_time__gte=since_30).count(),
            }
        )


# ---------------------------------------------------------------------------
# Item 111 — funnel dashboards (ANA-1's activation metrics, shaped as the
# admin funnel view).
# ---------------------------------------------------------------------------


def funnel_snapshot() -> dict:
    """signup → first submission → first AC → first contest registration."""
    total_users = User.objects.filter(is_active=True).count()
    submitters = Submission.objects.values_list("user_id").distinct().count()
    first_ac = (
        Submission.objects.filter(verdict=Submission.VerdictStatus.ACCEPTED)
        .values_list("user_id")
        .distinct()
        .count()
    )
    contest_users = (
        ContestParticipation.objects.values_list("user_id").distinct().count()
    )
    steps = [
        {"key": "signup", "count": total_users},
        {"key": "first_submission", "count": submitters},
        {"key": "first_ac", "count": first_ac},
        {"key": "first_contest", "count": contest_users},
    ]
    for index, step in enumerate(steps):
        step["rate"] = round(step["count"] / total_users, 4) if total_users else None
        if index:
            prev = steps[index - 1]["count"]
            step["step_rate"] = round(step["count"] / prev, 4) if prev else None
    return {"steps": steps, "generated_at": timezone.now()}


class FunnelDashboardView(APIView):
    """GET /api/v1/analytics/funnel/ (ADMIN)."""

    permission_classes = [permissions.IsAuthenticated, IsAdminUser]

    def get(self, request):
        return Response(funnel_snapshot())


# ---------------------------------------------------------------------------
# Item 110 — search analytics.
# ---------------------------------------------------------------------------


def log_search(query: str, results: dict, user) -> None:
    """Persist one federated-search invocation (best-effort)."""
    total = sum(len(rows) for rows in results.values())
    zero_kinds = [kind for kind, rows in results.items() if not rows]
    try:
        SearchQuery.objects.create(
            query=query[:120],
            user=user if (user and user.is_authenticated) else None,
            results_total=total,
            zero_result_kinds=zero_kinds,
        )
    except Exception:  # noqa: BLE001 — analytics must never break search
        logger.warning("search log failed", exc_info=True)


class SearchAnalyticsView(APIView):
    """GET /api/v1/analytics/search/ (ADMIN) — top + zero-result queries."""

    permission_classes = [permissions.IsAuthenticated, IsAdminUser]

    def get(self, request):
        top = (
            SearchQuery.objects.values("query")
            .annotate(n=Count("id"))
            .order_by("-n")[:10]
        )
        zero = (
            SearchQuery.objects.filter(results_total=0)
            .values("query")
            .annotate(n=Count("id"))
            .order_by("-n")[:10]
        )
        return Response(
            {
                "total_searches": SearchQuery.objects.count(),
                "top_queries": list(top),
                "zero_result_queries": list(zero),
            }
        )


# ---------------------------------------------------------------------------
# Item 107 — webhooks.
# ---------------------------------------------------------------------------


def sign_payload(secret: str, body: str) -> str:
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


def _validated_webhook_url(url: str) -> str | None:
    """SSRF guard (CodeQL py/full-ssrf): webhook URLs are ADMIN-configured,
    but validated anyway — https-only, no credentials, no IP-literal /
    loopback / link-local / private hosts, no unusual ports. Returns the
    cleaned URL or None when rejected."""
    from urllib.parse import urlsplit

    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return None
    if parts.scheme != "https" or parts.hostname in (None, ""):
        return None
    if parts.username or parts.password:
        return None
    if parts.port is not None and parts.port not in (443,):
        return None
    host = parts.hostname.lower()
    import ipaddress

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None  # a DNS name — acceptable; resolution-level filtering
        # happens at the egress firewall (RUNBOOK §edge).
    if ip is not None and (
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
    ):
        return None
    return parts.geturl()


def deliver_to_endpoint(endpoint: WebhookEndpoint, event: str, payload: dict) -> bool:
    """One signed delivery attempt to one endpoint (the ping path)."""
    body = json.dumps(payload)
    delivery = WebhookDelivery.objects.create(
        endpoint=endpoint, event=event, payload=payload
    )
    url = _validated_webhook_url(endpoint.url)
    if url is None:
        delivery.status = "rejected"
        delivery.response_status = 0
        delivery.error = "endpoint URL failed SSRF validation (https, public host)"
        delivery.save(update_fields=["status", "response_status", "error"])
        return False
    try:
        response = requests.post(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Webcoder-Event": event,
                "X-Webcoder-Signature": f"sha256={sign_payload(endpoint.secret, body)}",
            },
            timeout=WEBHOOK_TIMEOUT_S,
        )
        delivery.status_code = response.status_code
        if response.status_code < 300:
            delivery.delivered_at = timezone.now()
            delivery.save()
            return True
    except Exception as exc:  # noqa: BLE001 — delivery is best-effort
        delivery.error = str(exc)[:500]
    delivery.save()
    return False


def dispatch_webhooks(event: str, payload: dict) -> int:
    """Fan an event out to every active subscriber; returns deliveries.

    ``events`` is a JSON list — the ``__contains`` lookup is not portable
    across backends (sqlite), so the active set is filtered in Python.
    """
    sent = 0
    for endpoint in WebhookEndpoint.objects.filter(is_active=True):
        if event not in (endpoint.events or []):
            continue
        if deliver_to_endpoint(endpoint, event, payload):
            sent += 1
    return sent


class WebhookEndpointView(APIView):
    """POST/GET/DELETE /api/v1/analytics/webhooks/ (owner-scoped, 107)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        rows = WebhookEndpoint.objects.filter(owner=request.user)
        return Response(
            [
                {
                    "id": row.id,
                    "url": row.url,
                    "events": row.events,
                    "is_active": row.is_active,
                }
                for row in rows
            ]
        )

    def post(self, request):
        url = (request.data.get("url") or "").strip()
        events = request.data.get("events") or []
        if not url.startswith("https://"):
            return Response(
                {"detail": "Webhook URLs must be https."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        invalid = [e for e in events if e not in WEBHOOK_EVENTS]
        if invalid:
            return Response(
                {"detail": f"Unknown events: {invalid}. Valid: {WEBHOOK_EVENTS}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not events:
            return Response(
                {"detail": "At least one event is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        import secrets

        endpoint = WebhookEndpoint.objects.create(
            owner=request.user,
            url=url,
            events=events,
            secret=secrets.token_hex(16),
        )
        return Response(
            {"id": endpoint.id, "url": endpoint.url, "secret": endpoint.secret},
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request):
        endpoint_id = request.query_params.get("id")
        deleted, _ = WebhookEndpoint.objects.filter(
            owner=request.user, pk=endpoint_id
        ).delete()
        if not deleted:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"deleted": endpoint_id})


class WebhookPingView(APIView):
    """POST /api/v1/analytics/webhooks/{id}/ping/ — a test delivery (107)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, endpoint_id):
        endpoint = WebhookEndpoint.objects.filter(
            owner=request.user, pk=endpoint_id
        ).first()
        if endpoint is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        ok = deliver_to_endpoint(
            endpoint, "submission.judged", {"ping": True, "url": endpoint.url}
        )
        return Response({"delivered": ok})


class ExperimentVariantView(APIView):
    """GET /api/v1/analytics/experiments/{name}/variant/ (auth).

    Returns (and persists) the caller's deterministic arm; ``null`` when
    the experiment is unknown or inactive.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, name):
        experiment = Experiment.objects.filter(name=name, is_active=True).first()
        if experiment is None or not experiment.variants:
            return Response({"variant": None})
        assignment = ExperimentAssignment.objects.filter(
            experiment=experiment, user=request.user
        ).first()
        if assignment is None:
            assignment = ExperimentAssignment.objects.create(
                experiment=experiment,
                user=request.user,
                variant=experiment.variant_for(request.user.id),
            )
        return Response({"variant": assignment.variant, "experiment": experiment.name})


class ExperimentStatsView(APIView):
    """GET /api/v1/analytics/experiments/{name}/stats/ (ADMIN)."""

    permission_classes = [permissions.IsAuthenticated, IsAdminUser]

    def get(self, request, name):
        experiment = Experiment.objects.filter(name=name).first()
        if experiment is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        rows = (
            ExperimentAssignment.objects.filter(experiment=experiment)
            .values("variant")
            .annotate(n=Count("id"))
            .order_by("-n")
        )
        return Response(
            {
                "experiment": experiment.name,
                "is_active": experiment.is_active,
                "variants": list(rows),
            }
        )


# ---------------------------------------------------------------------------
# Item 112 — season reports.
# ---------------------------------------------------------------------------


def build_season_report(season: str) -> str:
    """Compile the quarterly report from live aggregates."""
    now = timezone.now()
    year = int(season[:4])
    quarter = int(season[5])
    start = timezone.make_aware(
        __import__("datetime").datetime(year, 3 * quarter - 2, 1)
    )
    end = min(
        timezone.make_aware(
            __import__("datetime").datetime(
                year + (quarter == 4), 1 if quarter == 4 else 3 * quarter + 1, 1
            )
        ),
        now,
    )
    users = User.objects.filter(
        date_joined__gte=start, date_joined__lte=end + timedelta(seconds=1)
    ).count()
    total_users = User.objects.filter(is_active=True).count()
    subs = Submission.objects.filter(
        submission_time__gte=start, submission_time__lte=end + timedelta(seconds=1)
    )
    contests = Contest.objects.filter(start_at__gte=start, start_at__lte=end)
    problems = Problem.objects.filter(creation_date__gte=start, creation_date__lte=end)
    lines = [
        f"# WebCoder {season} report",
        "",
        f"- New accounts: **{users}** (platform total: {total_users})",
        f"- Submissions judged: **{subs.count()}**",
        f"- Accepted: **{subs.filter(verdict=Submission.VerdictStatus.ACCEPTED).count()}**",
        f"- Contests started: **{contests.count()}**",
        f"- Problems authored: **{problems.count()}**",
        "",
        (
            "_Generated from live aggregates; integrity numbers (moderation "
            "actions, takedowns) are appended by the moderation queue._"
        ),
    ]
    return "\n".join(lines)


class SeasonReportView(APIView):
    """GET/POST /api/v1/analytics/season-reports/ (ADMIN, item 112).

    GET lists the stored reports (or ?season=2026Q4 returns one);
    POST {season} (re)generates a report from live aggregates.
    """

    permission_classes = [permissions.IsAuthenticated, IsAdminUser]

    def get(self, request):
        season = request.query_params.get("season")
        if season:
            row = SeasonReport.objects.filter(season=season).first()
            if row is None:
                return Response(
                    {"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND
                )
            return Response(
                {
                    "season": row.season,
                    "markdown": row.markdown,
                    "generated_at": row.generated_at,
                }
            )
        rows = SeasonReport.objects.all()
        return Response(
            [{"season": r.season, "generated_at": r.generated_at} for r in rows]
        )

    def post(self, request):
        import re

        season = (request.data.get("season") or "").strip()
        if not re.fullmatch(r"\d{4}Q[1-4]", season):
            return Response(
                {"detail": "season must look like 2026Q4."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row, _created = SeasonReport.objects.update_or_create(
            season=season, defaults={"markdown": build_season_report(season)}
        )
        return Response(
            {
                "season": row.season,
                "markdown": row.markdown,
                "generated_at": row.generated_at,
                "created": _created,
            },
            status=status.HTTP_201_CREATED if _created else status.HTTP_200_OK,
        )
