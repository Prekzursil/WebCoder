"""Wave G PR7 backend tests — ops, performance, reliability (135/136/139/
143/145). The infra-only items (140/141/142/144) ship as compose files,
scripts, workflow and RUNBOOK sections, asserted here as file contracts."""

import json
import pathlib
from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from ops.autoscale import AutoscalePolicy, recommended_workers, scale_direction
from ops.costs import CostInputs, cost_inputs, project_costs
from ops.models import ErrorEvent, event_digest
from ops.tasks import purge_old_error_events
from problems.models import Problem
from submissions.models import Submission
from users.models import User

ROOT = pathlib.Path(__file__).resolve().parents[2]


def _problem():
    return Problem.objects.create(
        title_i18n={"en": "Sum"},
        statement_i18n={"en": "Add."},
        status=Problem.ProblemStatus.APPROVED,
    )


def _sub(user, problem, code="print(1)", verdict="AC", **extra):
    return Submission.objects.create(
        user=user,
        problem=problem,
        language="python3",
        code=code,
        verdict=verdict,
        **extra,
    )


class AutoscaleTest(TestCase):
    """Item 136 — the decision function."""

    def test_empty_queue_keeps_minimum(self):
        self.assertEqual(recommended_workers(0), 1)

    def test_scaling_math_clamps_to_policy(self):
        # 12 queued / 5 per worker → 3 workers.
        self.assertEqual(recommended_workers(12), 3)
        # Burst: >= 15 backlog always adds one over the minimum.
        self.assertEqual(recommended_workers(15), 4)
        # Hard ceiling.
        self.assertEqual(recommended_workers(10_000), AutoscalePolicy().max_workers)
        # Arrivals count as load too (5 arrivals/min = one worker's
        # drain capacity; 6 needs two).
        self.assertEqual(recommended_workers(0, arrivals_per_minute=5.0), 1)
        self.assertEqual(recommended_workers(0, arrivals_per_minute=6.0), 2)
        # Degenerate inputs are clamped, never negative.
        self.assertEqual(recommended_workers(-5), 1)

    def test_direction(self):
        self.assertEqual(scale_direction(1, 3), "up")
        self.assertEqual(scale_direction(3, 1), "down")
        self.assertEqual(scale_direction(2, 2), "hold")

    def test_custom_policy(self):
        policy = AutoscalePolicy(min_workers=2, max_workers=3)
        self.assertEqual(recommended_workers(0, policy=policy), 2)
        self.assertEqual(recommended_workers(999, policy=policy), 3)


class CostTest(TestCase):
    """Item 143 — transparent projection."""

    def test_projection_lines_and_total(self):
        inputs = CostInputs(workers=2, judge_vms=1, storage_gb=3.0, bandwidth_gb=4.0)
        payload = project_costs(inputs)
        self.assertEqual(payload["currency"], "EUR")
        self.assertEqual(payload["lines"]["vm_worker"]["eur"], 24.0)
        self.assertEqual(payload["lines"]["vm_judge"]["eur"], 12.0)
        self.assertEqual(payload["lines"]["storage"]["eur"], 0.3)
        self.assertEqual(payload["lines"]["bandwidth"]["eur"], 0.2)
        self.assertEqual(payload["total"], 36.5)
        # The formulas ship with the numbers (auditable).
        self.assertIn("2 × 12.0", payload["lines"]["vm_worker"]["formula"])

    def test_env_override_and_bad_override(self):
        with override_settings():
            import os

            os.environ["COST_PRICE_VM_WORKER"] = "20.5"
            os.environ["COST_PRICE_STORAGE_GB"] = "not-a-number"
            try:
                payload = project_costs(CostInputs(1, 1, 1.0, 1.0))
            finally:
                del os.environ["COST_PRICE_VM_WORKER"]
                del os.environ["COST_PRICE_STORAGE_GB"]
        self.assertEqual(payload["lines"]["vm_worker"]["eur"], 20.5)
        # Malformed override falls back to the default, not a 500.
        self.assertEqual(payload["lines"]["storage"]["eur"], 0.1)

    def test_live_inputs_from_database(self):
        from problems.models import TestCase as ProblemTestCase
        from submissions.models import SubmissionTestResult

        user = User.objects.create_user(username="cuser", password="pw")
        problem = _problem()
        # ~0.6 MB of code so the GB-scale projection is non-zero.
        submission = _sub(user, problem, code="x" * 600_000)
        test_case = ProblemTestCase.objects.create(
            problem=problem, input_data="in", expected_output_data="out"
        )
        SubmissionTestResult.objects.create(
            submission=submission,
            test_case=test_case,
            verdict=Submission.VerdictStatus.ACCEPTED,
            actual_output="a" * 2048,
            error_output="",
        )
        inputs = cost_inputs()
        self.assertEqual(inputs.workers, 1)
        self.assertGreater(inputs.storage_gb, 0.0)
        self.assertGreater(inputs.bandwidth_gb, 0.0)

    def test_empty_database_is_zero_cost_inputs(self):
        inputs = cost_inputs()
        self.assertEqual(inputs.storage_gb, 0.0)
        self.assertEqual(inputs.bandwidth_gb, 0.0)


class ErrorTrackingTest(TestCase):
    """Item 145 — middleware + stream + retention."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="oadm", password="pw", role="ADMIN", is_staff=True
        )
        self.client = APIClient()

    def test_middleware_records_5xx(self):
        # Exercise the middleware contract directly with a fake response
        # (a real 500 needs a raising view, which pollutes ROOT_URLCONF).
        from ops.models import ErrorCaptureMiddleware

        recorded = []

        class FakeRequest:
            method = "POST"
            path = "/api/v1/submissions/submit/"
            user = self.admin

        class FakeResponse:
            status_code = 503
            reason_phrase = "Service Unavailable"

        middleware = ErrorCaptureMiddleware(lambda request: FakeResponse())
        real_create = ErrorEvent.objects.create
        ErrorEvent.objects.create = lambda **kw: recorded.append(kw)
        try:
            response = middleware(FakeRequest())
        finally:
            ErrorEvent.objects.create = real_create
        self.assertEqual(response.status_code, 503)
        self.assertEqual(len(recorded), 1)
        self.assertEqual(recorded[0]["status_code"], 503)
        self.assertEqual(recorded[0]["user_id"], self.admin.id)

        # 2xx responses are NOT recorded.
        recorded.clear()

        class OkResponse(FakeResponse):
            status_code = 200

        middleware_ok = ErrorCaptureMiddleware(lambda request: OkResponse())
        middleware_ok(FakeRequest())
        self.assertEqual(recorded, [])

    def test_anonymous_user_recorded_with_null_id(self):
        from ops.models import ErrorCaptureMiddleware

        class AnonRequest:
            method = "GET"
            path = "/api/v1/problems/"
            user = None

        class ServerError:
            status_code = 500
            reason_phrase = "Internal Server Error"

        captured = {}
        real_create = ErrorEvent.objects.create

        def spy(**kwargs):
            captured.update(kwargs)
            return real_create(**kwargs)

        ErrorEvent.objects.create = spy
        try:
            ErrorCaptureMiddleware(lambda request: ServerError())(AnonRequest())
        finally:
            ErrorEvent.objects.create = real_create
        self.assertIsNone(captured["user_id"])
        self.assertEqual(captured["status_code"], 500)

    def test_digest_groups_repeats(self):
        a = event_digest("POST", "/x/", 500)
        b = event_digest("POST", "/x/", 500)
        c = event_digest("POST", "/x/", 502)
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)

    def test_errors_endpoint_groups_and_lists(self):
        user = User.objects.create_user(username="oerr", password="pw")
        for _ in range(3):
            ErrorEvent.objects.create(
                path="/api/v1/x/",
                method="POST",
                status_code=500,
                message="boom",
                user_id=user.id,
                digest=event_digest("POST", "/api/v1/x/", 500),
            )
        self.client.force_authenticate(self.admin)
        data = self.client.get("/api/v1/ops/errors/").data
        self.assertEqual(data["total"], 3)
        self.assertEqual(data["grouped"][0]["count"], 3)
        self.assertEqual(len(data["events"]), 3)

    def test_errors_requires_admin(self):
        basic = User.objects.create_user(username="obas", password="pw")
        self.client.force_authenticate(basic)
        self.assertEqual(self.client.get("/api/v1/ops/errors/").status_code, 403)

    def test_purge_retention(self):
        old = ErrorEvent.objects.create(
            path="/a/",
            method="GET",
            status_code=500,
            message="",
            digest="d1",
        )
        ErrorEvent.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=31)
        )
        fresh = ErrorEvent.objects.create(
            path="/b/",
            method="GET",
            status_code=500,
            message="",
            digest="d2",
        )
        deleted = purge_old_error_events()
        self.assertEqual(deleted, 1)
        self.assertFalse(ErrorEvent.objects.filter(pk=old.pk).exists())
        self.assertTrue(ErrorEvent.objects.filter(pk=fresh.pk).exists())

    def test_model_str(self):
        event = ErrorEvent.objects.create(
            path="/a/", method="GET", status_code=500, message="", digest="d"
        )
        self.assertIn("500", str(event))


class StatusFeedTest(TestCase):
    """Items 135/139 — public aggregate status."""

    def setUp(self):
        self.user = User.objects.create_user(username="suser", password="pw")
        self.problem = _problem()

    def test_feed_is_public_and_aggregate_only(self):
        anon = APIClient()
        response = anon.get("/api/v1/ops/status/")
        self.assertEqual(response.status_code, 200)
        payload = response.data
        self.assertIn(payload["overall"], ("ok", "degraded"))
        self.assertIn("contest", payload["queue_lanes"])
        self.assertIn("practice", payload["queue_lanes"])
        self.assertEqual(payload["judge_last_24h"]["window_hours"], 24)
        # No usernames anywhere in the public payload.
        self.assertNotIn("suser", json.dumps(payload, default=str))

    def test_backlog_degrades_judge_component(self):
        other = User.objects.create_user(username="sother", password="pw")
        for i in range(51):
            _sub(
                self.user if i % 2 else other,
                self.problem,
                verdict="PENDING",
            )
        payload = APIClient().get("/api/v1/ops/status/").data
        self.assertEqual(payload["components"]["judge"]["state"], "degraded")
        self.assertEqual(payload["overall"], "degraded")
        self.assertEqual(payload["components"]["judge"]["backlog"], 51)

    def test_judge_duration_stats(self):
        now = timezone.now()
        _sub(
            self.user,
            self.problem,
            verdict="AC",
            execution_time_ms=100,
            submission_time=now,
        )
        payload = APIClient().get("/api/v1/ops/status/").data
        self.assertEqual(payload["judge_last_24h"]["judged"], 1)
        self.assertEqual(payload["judge_last_24h"]["avg_execution_ms"], 100)


class OpsInfraContractsTest(TestCase):
    """Items 140/141/142/144 ship as infra files; these contracts pin
    their presence and key contents (the RUNBOOK is the operator's
    interface — a silently-deleted section is a regression)."""

    def test_compose_files_exist(self):
        for name in (
            "docker-compose.edge.yml",
            "docker-compose.blue.yml",
            "docker-compose.green.yml",
        ):
            path = ROOT / name
            self.assertTrue(path.exists(), f"{name} missing")

    def test_edge_file_carries_hardening(self):
        edge = (ROOT / "edge" / "Caddyfile").read_text(encoding="utf-8")
        self.assertIn("X-Content-Type-Options", edge)
        self.assertIn("Strict-Transport-Security", edge)
        compose_edge = (ROOT / "docker-compose.edge.yml").read_text(encoding="utf-8")
        self.assertIn("caddy", compose_edge)

    def test_scripts_exist(self):
        for name in (
            "scripts/judge-autoscale.sh",
            "scripts/restore-drill.sh",
            "scripts/deploy-blue-green.sh",
            "e2e/loadtest/replay.mjs",
        ):
            self.assertTrue((ROOT / name).exists(), f"{name} missing")

    def test_nightly_workflow_exists(self):
        workflow = (ROOT / ".github" / "workflows" / "e2e-nightly.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("schedule:", workflow)
        self.assertIn("cron:", workflow)

    def test_runbook_gains_sections(self):
        runbook = (ROOT / "docs" / "RUNBOOK.md").read_text(encoding="utf-8")
        for section in (
            "§autoscaling",
            "§blue-green",
            "§restore-drill",
            "§edge",
            "§loadtest",
        ):
            self.assertIn(section, runbook)


class OpsAPIAccessTest(TestCase):
    """Admin-only endpoints guard against non-admins."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="zadm", password="pw", role="ADMIN", is_staff=True
        )

    def test_costs_and_autoscale_admin_only(self):
        basic = User.objects.create_user(username="zbas", password="pw")
        client = APIClient()
        client.force_authenticate(basic)
        self.assertEqual(client.get("/api/v1/ops/costs/").status_code, 403)
        self.assertEqual(client.get("/api/v1/ops/autoscale/").status_code, 403)
        client.force_authenticate(self.admin)
        costs = client.get("/api/v1/ops/costs/").data
        self.assertEqual(costs["currency"], "EUR")
        self.assertIn("lines", costs)
        autoscale = client.get("/api/v1/ops/autoscale/").data
        self.assertEqual(autoscale["direction"], "hold")
        self.assertIn("policy", autoscale)
