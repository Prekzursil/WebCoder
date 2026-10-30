"""Observability baseline tests (round-2 X3): healthz/readyz probes,
admin metrics snapshot, JSON log formatter, beat schedule, and the
submission test-output retention task.
"""

import logging
from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone

from django.test import override_settings
from rest_framework.test import APIClient

from problems.models import Problem
from submissions.models import Submission, SubmissionTestResult
from submissions.tasks import prune_old_test_outputs
from users.models import User
from webcoder_api import observability
from webcoder_api.settings import CELERY_BEAT_SCHEDULE

pytestmark = pytest.mark.django_db


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="opsadmin", password="pw-12345678", role=User.Roles.ADMIN
    )


@pytest.fixture
def basic_user(db):
    return User.objects.create_user(
        username="opsbasic", password="pw-12345678", role=User.Roles.BASIC_USER
    )


class TestHealthz:
    def test_liveness_ok(self, client):
        response = client.get("/healthz")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestReadyz:
    def test_all_components_ok_filesystem_broker(self, client):
        response = client.get("/readyz")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["components"]["database"] == {"ok": True, "detail": "ok"}
        assert body["components"]["cache"]["ok"] is True
        # CI/dev broker is the filesystem transport: a ping is meaningless,
        # so the component reports itself skipped instead of failing.
        assert body["components"]["broker"]["skipped"] is True

    def test_database_down_returns_503(self, client):
        with mock.patch.object(
            observability, "_check_database", return_value=(False, "OperationalError: x")
        ):
            response = client.get("/readyz")
        assert response.status_code == 503
        body = response.json()
        assert body["status"] == "unavailable"
        assert body["components"]["database"]["ok"] is False

    def test_database_exception_branch(self, client):
        # The raw except inside _check_database (mock at the cursor layer so
        # the real branch code executes).
        with mock.patch.object(
            observability.connection, "ensure_connection", side_effect=RuntimeError("db gone")
        ):
            ok, detail = observability._check_database()
        assert ok is False
        assert "RuntimeError" in detail

    def test_cache_exception_branch(self, client):
        with mock.patch(
            "django.core.cache.cache.set", side_effect=RuntimeError("cache gone")
        ):
            ok, detail = observability._check_cache()
        assert ok is False
        assert "RuntimeError" in detail

    def test_cache_exception_returns_503(self, client):
        with mock.patch.object(
            observability, "_check_cache", return_value=(False, "InvalidCacheBackend: x")
        ):
            response = client.get("/readyz")
        assert response.status_code == 503
        assert response.json()["components"]["cache"]["ok"] is False

    def test_cache_roundtrip_mismatch_returns_503(self, client):
        # cache.set succeeds but cache.get returns the wrong value: the
        # explicit mismatch branch inside _check_cache.
        with mock.patch("django.core.cache.cache.get", return_value=None):
            response = client.get("/readyz")
        assert response.status_code == 503
        assert response.json()["components"]["cache"]["detail"] == "cache round-trip mismatch"

    @override_settings(CELERY_BROKER_URL="redis://127.0.0.1:6379/0")
    def test_redis_broker_ok(self, client):
        with mock.patch("redis.Redis.from_url") as from_url:
            from_url.return_value.ping.return_value = True
            response = client.get("/readyz")
        assert response.status_code == 200
        broker = response.json()["components"]["broker"]
        assert broker == {"ok": True, "detail": "ok", "skipped": False}
        from_url.return_value.ping.assert_called_once()

    @override_settings(CELERY_BROKER_URL="redis://127.0.0.1:6379/0")
    def test_redis_broker_unreachable_returns_503(self, client):
        with mock.patch(
            "redis.Redis.from_url", side_effect=OSError("connection refused")
        ):
            response = client.get("/readyz")
        assert response.status_code == 503
        broker = response.json()["components"]["broker"]
        assert broker["ok"] is False
        assert "connection refused" in broker["detail"]


class TestMetrics:
    def _authenticated(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_anonymous_forbidden(self, client):
        response = client.get("/api/v1/admin/metrics/")
        assert response.status_code in (401, 403)

    def test_basic_user_forbidden(self, basic_user):
        response = self._authenticated(basic_user).get("/api/v1/admin/metrics/")
        assert response.status_code == 403

    def test_admin_gets_snapshot(self, admin_user, basic_user):
        # Seed a couple of rows so the aggregates have something to count.
        author = User.objects.create_user(
            username="metrics-author", password="pw-12345678", role=User.Roles.PROBLEM_CREATOR
        )
        problem = Problem.objects.create(
            title_i18n={"en": "Metrics problem", "ro": "Problemă metrici"},
            statement_i18n={"en": "stmt", "ro": "stmt"},
            difficulty=Problem.DifficultyLevel.EASY,
            status=Problem.ProblemStatus.APPROVED,
            author=author,
        )
        Submission.objects.create(
            user=basic_user,
            problem=problem,
            language="python3",
            code="print(1)",
            verdict=Submission.VerdictStatus.ACCEPTED,
            execution_time_ms=42,
        )
        response = self._authenticated(admin_user).get("/api/v1/admin/metrics/")
        assert response.status_code == 200
        body = response.json()
        assert body["users"] >= 3
        assert body["problems"]["APPROVED"] >= 1
        assert (
            body["submissions"]["verdicts"].get(Submission.VerdictStatus.ACCEPTED, 0) >= 1
        )
        assert set(body["submissions"]["queue_depth"]) == {
            Submission.VerdictStatus.PENDING,
            Submission.VerdictStatus.COMPILING,
            Submission.VerdictStatus.RUNNING,
        }
        assert body["judge"]["last_24h"]["count"] >= 1
        assert body["judge"]["last_24h"]["avg_ms"] is not None
        assert body["judge"]["test_results_stored"] >= 0


class TestJsonFormatter:
    def test_formats_plain_record(self):
        formatter = observability.JsonFormatter()
        record = logging.LogRecord(
            name="webcoder.test",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="hello %s",
            args=("world",),
            exc_info=None,
        )
        import json

        entry = json.loads(formatter.format(record))
        assert entry["level"] == "INFO"
        assert entry["logger"] == "webcoder.test"
        assert entry["message"] == "hello world"
        assert "ts" in entry
        assert "exc_info" not in entry

    def test_formats_exception(self):
        formatter = observability.JsonFormatter()
        try:
            raise ValueError("boom")
        except ValueError:
            import sys

            record = logging.LogRecord(
                name="x",
                level=logging.ERROR,
                pathname=__file__,
                lineno=2,
                msg="failed",
                args=None,
                exc_info=sys.exc_info(),
            )
        import json

        entry = json.loads(formatter.format(record))
        assert "ValueError: boom" in entry["exc_info"]


class TestBeatSchedule:
    def test_maintenance_tasks_scheduled(self):
        assert set(CELERY_BEAT_SCHEDULE) == {
            "leaderboard-nightly-recompute",
            "notifications-purge",
            "submission-test-output-retention",
            "deleted-users-purge",
            "contest-tick",  # Wave B CON-8/OPR-4: end-of-contest finalize
            "owner-weekly-metrics",  # ANA-1 (Wave D): Monday snapshot
            "weekly-digest",  # UXP-5b: weekly practice digest (no-ops
            # without EMAIL_HOST — see RUNBOOK §email)
        }
        assert (
            CELERY_BEAT_SCHEDULE["leaderboard-nightly-recompute"]["task"]
            == "leaderboard.aggregation.recompute_all_leaderboards_task"
        )
        assert (
            CELERY_BEAT_SCHEDULE["notifications-purge"]["task"]
            == "notifications.tasks.purge_old_notifications"
        )
        assert (
            CELERY_BEAT_SCHEDULE["submission-test-output-retention"]["task"]
            == "submissions.tasks.prune_old_test_outputs"
        )


class TestPruneOldTestOutputs:
    def _make(self, days_old: int, output: str):
        author = User.objects.create_user(
            username=f"prune-author-{days_old}-{abs(hash(output)) % 1000}",
            password="pw-12345678",
            role=User.Roles.PROBLEM_CREATOR,
        )
        problem = Problem.objects.create(
            title_i18n={"en": f"Prune {days_old}"},
            statement_i18n={"en": "s"},
            difficulty=Problem.DifficultyLevel.EASY,
            status=Problem.ProblemStatus.APPROVED,
            author=author,
        )
        test_case = problem.test_cases.create(
            input_data="1 2",
            expected_output_data="3",
            points=10,
            is_sample=True,
        )
        submission = Submission.objects.create(
            user=author,
            problem=problem,
            language="python3",
            code="print(3)",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        # auto_now_add filled submission_time with now; force the age.
        Submission.objects.filter(pk=submission.pk).update(
            submission_time=timezone.now() - timedelta(days=days_old)
        )
        result = SubmissionTestResult.objects.create(
            submission=submission,
            test_case=test_case,
            verdict=Submission.VerdictStatus.ACCEPTED,
            actual_output=output,
            error_output=output,
        )
        return submission, result

    def test_old_outputs_blanked_recent_kept(self):
        _old_sub, old_result = self._make(days_old=120, output="ancient-blob")
        _new_sub, new_result = self._make(days_old=1, output="fresh-blob")

        pruned = prune_old_test_outputs()

        old_result.refresh_from_db()
        new_result.refresh_from_db()
        assert pruned == 1
        assert old_result.actual_output == ""
        assert old_result.error_output == ""
        assert new_result.actual_output == "fresh-blob"
        # Verdicts/metadata survive; only the bulky blobs are dropped.
        assert old_result.verdict == Submission.VerdictStatus.ACCEPTED

    def test_idempotent_second_run(self):
        _sub, result = self._make(days_old=200, output="x")
        assert prune_old_test_outputs() == 1
        # Already blank → excluded by the .exclude() filter, returns 0.
        assert prune_old_test_outputs() == 0
