"""Observability baseline for the WebCoder API (SPEC-GAPS round-2 X3).

Three probe endpoints plus a JSON log formatter:

- ``GET /healthz`` — liveness. Deliberately touches NO dependency: a
  liveness probe must keep answering while the process is up even when the
  database (or anything else) is down, so orchestrators restart on real
  process death rather than dependency flaps.
- ``GET /readyz`` — readiness. Pings every stateful dependency the API
  needs to serve traffic: database, cache, broker. Returns 200 when all
  components are okay, 503 with a per-component breakdown otherwise. The
  broker component is a no-op pass (``skipped``) when the deployment uses
  the local/filesystem broker, where a ping is meaningless.
- ``GET /api/v1/admin/metrics/`` — JSON snapshot for operators: user and
  content counts, submission verdict distribution, judge queue depth
  (in-flight submission states) and judge-duration stats over the last
  24h. Admin-only.

- :class:`JsonFormatter` — opt-in structured logging (``LOG_JSON=1``) so a
  local aggregator can parse request/task logs without regexes.

Wired into compose healthchecks and the RUNBOOK load/uptime story.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.db.models import Count, Q
from django.http import JsonResponse
from django.utils import timezone
from rest_framework.views import APIView

from users.permissions import IsAdminUser

from .jsonlog import JsonFormatter  # noqa: F401  (re-export)

from problems.models import Problem
from submissions.models import Submission, SubmissionTestResult
from users.models import User

# In-flight verdicts a submission can sit in while queued/being judged —
# the "queue depth" signal for the metrics snapshot.
_IN_FLIGHT_VERDICTS = [
    Submission.VerdictStatus.PENDING,
    Submission.VerdictStatus.COMPILING,
    Submission.VerdictStatus.RUNNING,
]


def healthz(request):
    """Liveness probe: process is up. No dependency touched, on purpose."""
    return JsonResponse({"status": "ok"})


def _check_database() -> tuple[bool, str]:
    try:
        connection.ensure_connection()
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"
    return True, "ok"


def _check_cache() -> tuple[bool, str]:
    try:
        cache.set("readyz_probe", "1", 5)
        if cache.get("readyz_probe") != "1":
            return False, "cache round-trip mismatch"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"
    return True, "ok"


def _check_broker() -> tuple[bool, str, bool]:
    """Ping the broker when it is a real (network) broker.

    Returns ``(ok, detail, checked)``. The filesystem/local dev broker
    cannot be pinged meaningfully, so it reports ``checked=False`` (rendered
    as ``skipped``) instead of failing readiness on a non-deployment.
    """
    url = getattr(settings, "CELERY_BROKER_URL", "filesystem://")
    if not url.startswith("redis://"):
        return True, f"not applicable for broker {url}", False
    try:
        import redis  # redis-py is pinned in deps.txt for the celery broker

        client = redis.Redis.from_url(url, socket_connect_timeout=2, socket_timeout=2)
        client.ping()
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}", True
    return True, "ok", True


def readyz(request):
    """Readiness probe: every stateful dependency answers."""
    components = {}
    ok = True

    db_ok, db_detail = _check_database()
    components["database"] = {"ok": db_ok, "detail": db_detail}
    ok = ok and db_ok

    cache_ok, cache_detail = _check_cache()
    components["cache"] = {"ok": cache_ok, "detail": cache_detail}
    ok = ok and cache_ok

    broker_ok, broker_detail, broker_checked = _check_broker()
    components["broker"] = {
        "ok": broker_ok,
        "detail": broker_detail,
        "skipped": not broker_checked,
    }
    ok = ok and broker_ok

    return JsonResponse(
        {"status": "ok" if ok else "unavailable", "components": components},
        status=200 if ok else 503,
    )


class MetricsView(APIView):
    """Operator metrics snapshot (admin-only). JSON, deliberately simple.

    Everything here is derived from existing tables with cheap aggregates —
    this is a baseline for the local stack, not a time-series store; scrape
    interval is expected to be minutes, not seconds.
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        since = timezone.now() - timedelta(hours=24)

        verdict_counts = {
            verdict: count
            for verdict, count in Submission.objects.values_list("verdict")
            .annotate(n=Count("id"))
            .order_by()
        }
        queue_depth = {
            verdict: verdict_counts.get(verdict, 0) for verdict in _IN_FLIGHT_VERDICTS
        }
        # OPR-4 lane split: contest-bound in-flight verdicts travel the
        # judge-contest queue — operators watch this number during a live
        # contest (alert threshold guidance lives in RUNBOOK).
        in_flight = Q(verdict__in=_IN_FLIGHT_VERDICTS)
        queue_depth_lanes = {
            "contest": Submission.objects.filter(
                in_flight, contest__isnull=False
            ).count(),
            "practice": Submission.objects.filter(
                in_flight, contest__isnull=True
            ).count(),
        }

        judged_recent = Submission.objects.filter(
            submission_time__gte=since,
            execution_time_ms__isnull=False,
        )
        durations = [s.execution_time_ms for s in judged_recent if s.execution_time_ms]
        duration_stats = {
            "count": len(durations),
            "avg_ms": round(sum(durations) / len(durations)) if durations else None,
            "max_ms": max(durations) if durations else None,
        }

        payload = {
            "users": User.objects.count(),
            "problems": {
                status: Problem.objects.filter(status=status).count()
                for status in Problem.ProblemStatus.values
            },
            "submissions": {
                "total": Submission.objects.count(),
                "verdicts": verdict_counts,
                "queue_depth": queue_depth,
                "queue_depth_lanes": queue_depth_lanes,
            },
            "judge": {
                "last_24h": duration_stats,
                "test_results_stored": SubmissionTestResult.objects.count(),
            },
        }
        return JsonResponse(payload)
