"""Wave G section J operator endpoints.

- ``GET /api/v1/ops/status/`` (items 135/139) — PUBLIC, aggregate-only:
  queue lanes, judge 24h stats, component summary, error rate. Nothing
  user-identifying; safe for the public /status page to poll.
- ``GET /api/v1/ops/errors/`` (item 145) — ADMIN error stream.
- ``GET /api/v1/ops/costs/`` (item 143) — ADMIN cost projection.
- ``GET /api/v1/ops/autoscale/`` (item 136) — ADMIN worker recommendation.
"""

from datetime import timedelta

from django.db.models import Count
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from submissions.models import Submission
from users.models import User

from .autoscale import AutoscalePolicy, recommended_workers, scale_direction
from .costs import cost_inputs, project_costs
from .models import ErrorEvent

# Same in-flight verdict set as webcoder_api.observability.
_IN_FLIGHT = ("PENDING", "JUDGING", "IN_QUEUE", "QUEUED", "RUNNING", "COMPILING")


def _judge_window_stats(hours: int = 24) -> dict:
    since = timezone.now() - timedelta(hours=hours)
    judged = Submission.objects.filter(
        submission_time__gte=since, execution_time_ms__isnull=False
    )
    durations = [s.execution_time_ms for s in judged if s.execution_time_ms]
    return {
        "window_hours": hours,
        "judged": len(durations),
        "avg_execution_ms": round(sum(durations) / len(durations))
        if durations
        else None,
        "max_execution_ms": max(durations) if durations else None,
    }


def _lane_depths() -> dict:
    in_flight = Submission.objects.filter(verdict__in=_IN_FLIGHT)
    return {
        "contest": in_flight.filter(contest__isnull=False).count(),
        "practice": in_flight.filter(contest__isnull=True).count(),
    }


class StatusFeedView(APIView):
    """Public aggregate status (items 135/139).

    Deliberately unauthenticated and read-only: the /status page and any
    external uptime monitor may poll it. No usernames, no submission
    bodies, no per-user anything.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        lanes = _lane_depths()
        hour_ago = timezone.now() - timedelta(hours=1)
        errors_1h = ErrorEvent.objects.filter(created_at__gte=hour_ago).count()
        submissions_1h = Submission.objects.filter(
            submission_time__gte=hour_ago
        ).count()
        # A component is "degraded" when the pipeline errors on a
        # meaningful share of traffic (guarding the empty-database
        # startup case: 0/0 is healthy).
        error_rate = (errors_1h / submissions_1h) if submissions_1h else 0.0
        judge_state = "ok"
        backlog = lanes["contest"] + lanes["practice"]
        if backlog > 50:
            judge_state = "degraded"
        components = {
            "api": {"state": "ok"},
            "judge": {"state": judge_state, "backlog": backlog},
        }
        return Response(
            {
                "generated_at": timezone.now().isoformat(),
                "overall": "ok"
                if all(c["state"] == "ok" for c in components.values())
                else "degraded",
                "components": components,
                "queue_lanes": lanes,
                "judge_last_24h": _judge_window_stats(24),
                "error_rate_1h": round(error_rate, 4),
            }
        )


class ErrorsView(APIView):
    """Admin error stream (item 145) — recent events + grouped counts."""

    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]

    def get(self, request):
        window = int(request.query_params.get("hours", 24) or 24)
        since = timezone.now() - timedelta(hours=window)
        events = ErrorEvent.objects.filter(created_at__gte=since)[:200]
        grouped = list(
            ErrorEvent.objects.filter(created_at__gte=since)
            .values("digest", "path", "method", "status_code")
            .annotate(count=Count("id"))
            .order_by("-count")[:20]
        )
        return Response(
            {
                "window_hours": window,
                "total": ErrorEvent.objects.filter(created_at__gte=since).count(),
                "grouped": grouped,
                "events": [
                    {
                        "id": e.id,
                        "created_at": e.created_at,
                        "path": e.path,
                        "method": e.method,
                        "status_code": e.status_code,
                        "message": e.message,
                        "user_id": e.user_id,
                    }
                    for e in events
                ],
            }
        )


class CostsView(APIView):
    """Admin cost projection (item 143)."""

    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]

    def get(self, request):
        workers = int(request.query_params.get("workers", 1) or 1)
        judges = int(request.query_params.get("judges", 1) or 1)
        inputs = cost_inputs(workers, judges)
        payload = project_costs(inputs)
        payload["inputs"] = {
            "workers": inputs.workers,
            "judge_vms": inputs.judge_vms,
            "storage_gb": inputs.storage_gb,
            "bandwidth_gb": inputs.bandwidth_gb,
            "submissions": Submission.objects.count(),
            "users": User.objects.count(),
        }
        return Response(payload)


class AutoscaleView(APIView):
    """Admin worker recommendation (item 136) — the decision function
    behind scripts/judge-autoscale.sh; the script applies it, this
    explains it."""

    permission_classes = [permissions.IsAuthenticated, permissions.IsAdminUser]

    def get(self, request):
        current = int(request.query_params.get("workers", 1) or 1)
        lanes = _lane_depths()
        depth = lanes["contest"] + lanes["practice"]
        policy = AutoscalePolicy()
        recommended = recommended_workers(depth, policy=policy)
        return Response(
            {
                "current_workers": current,
                "recommended_workers": recommended,
                "direction": scale_direction(current, recommended),
                "queue_depth": depth,
                "queue_lanes": lanes,
                "policy": {
                    "min_workers": policy.min_workers,
                    "max_workers": policy.max_workers,
                    "drain_per_worker_per_minute": policy.drain_per_worker_per_minute,
                    "burst_threshold": policy.burst_threshold,
                },
            }
        )
