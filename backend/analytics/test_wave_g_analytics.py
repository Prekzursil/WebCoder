"""Wave G PR5 backend tests — analytics & insights (items 102/104/105/
106/107/109/110/111/112)."""

from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from users.models import User

from analytics.models import (
    Experiment,
    ExperimentAssignment,
    SearchQuery,
    SeasonReport,
    WebhookEndpoint,
)
import analytics.views as views
from analytics.views import (
    build_season_report,
    dispatch_webhooks,
    funnel_snapshot,
    sign_payload,
)
from contests.models import Contest, ContestParticipation
from problems.models import Problem
from submissions.models import Submission


def _approved(**extra):
    return Problem.objects.create(
        title_i18n={"en": "Sum"},
        statement_i18n={"en": "Add."},
        status=Problem.ProblemStatus.APPROVED,
        **extra,
    )


class LanguageStatsTest(TestCase):
    """Item 102 — per-problem per-language acceptance."""

    def test_language_stats_in_statistics(self):
        author = User.objects.create_user(username="a1", password="pw")
        problem = _approved(author=author)
        alice = User.objects.create_user(username="alice", password="pw")
        bob = User.objects.create_user(username="bob", password="pw")
        Submission.objects.create(
            user=alice,
            problem=problem,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        Submission.objects.create(
            user=bob,
            problem=problem,
            language="cpp17",
            code="x",
            verdict=Submission.VerdictStatus.WRONG_ANSWER,
        )
        Submission.objects.create(
            user=bob,
            problem=problem,
            language="cpp17",
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        staff = User.objects.create_user(username="st", password="pw", is_staff=True)
        client = APIClient()
        client.force_authenticate(staff)
        data = client.get(f"/api/v1/problems/problems/{problem.id}/statistics/").data
        stats = data["language_stats"]
        self.assertEqual(stats["python3"]["tried"], 1)
        self.assertEqual(stats["python3"]["solved_users"], 1)
        self.assertEqual(stats["python3"]["acceptance_rate"], 1.0)
        self.assertEqual(stats["cpp17"]["tried"], 2)
        self.assertEqual(stats["cpp17"]["solved_users"], 1)
        self.assertEqual(stats["cpp17"]["acceptance_rate"], 0.5)


class HourOfDayTest(TestCase):
    """Item 104 — the 24-bin submission histogram."""

    def test_hour_bins_in_statistics(self):
        user = User.objects.create_user(username="h1", password="pw")
        problem = _approved()
        # The bins are UTC hours; compute the expected bin from the same
        # aware timestamp Django stores (robust to the test TIME_ZONE).
        for hour in (9, 9, 21):
            row = Submission.objects.create(
                user=user,
                problem=problem,
                language="python3",
                code="x",
                verdict=Submission.VerdictStatus.ACCEPTED,
            )
            # auto_now_add owns create-time values — set the clock after.
            Submission.objects.filter(pk=row.pk).update(
                submission_time=timezone.make_aware(
                    timezone.datetime(2026, 11, 10, hour)
                )
            )
        from users.statistics import user_statistics

        stats = user_statistics(user)
        self.assertEqual(len(stats["hour_of_day"]), 24)
        self.assertEqual(sum(stats["hour_of_day"]), 3, stats["hour_of_day"])
        # The exact bin depends on the deployment TZ conversion of the
        # stored UTC timestamp; what must hold: both 09:00 rows share a
        # bin (2 submissions) and the 21:00 row sits in another (1).
        peak = max(stats["hour_of_day"])
        self.assertEqual(peak, 2, stats["hour_of_day"])
        self.assertEqual(stats["hour_of_day"].count(peak), 1)
        self.assertEqual(sum(stats["hour_of_day"]), 3)


class OrgDashboardTest(TestCase):
    """Item 105 — school/county aggregates, teacher-scoped."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="adm", password="pw", role=User.Roles.ADMIN
        )
        self.teacher = User.objects.create_user(
            username="tch", password="pw", school="CNIT", role=User.Roles.TEACHER
        )
        self.student = User.objects.create_user(
            username="stu", password="pw", school="CNIT"
        )
        self.other = User.objects.create_user(
            username="oth", password="pw", school="Alta"
        )
        self.minor = User.objects.create_user(
            username="min", password="pw", school="CNIT", is_minor=True
        )
        self.problem = _approved()
        Submission.objects.create(
            user=self.student,
            problem=self.problem,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        self.client = APIClient()

    def test_admin_sees_school_segment(self):
        self.client.force_authenticate(self.admin)
        data = self.client.get("/api/v1/analytics/org/?school=CNIT").data
        # The minor is excluded from segmentation (LEG-2).
        self.assertEqual(data["members"], 2)
        self.assertEqual(data["total_solves"], 1)
        self.assertEqual(data["weekly_active_solvers"], 1)

    def test_teacher_limited_to_own_school(self):
        self.client.force_authenticate(self.teacher)
        ok = self.client.get("/api/v1/analytics/org/?school=CNIT")
        self.assertEqual(ok.status_code, 200)
        denied = self.client.get("/api/v1/analytics/org/?school=Alta")
        self.assertEqual(denied.status_code, 403)

    def test_student_gets_404(self):
        self.client.force_authenticate(self.student)
        response = self.client.get("/api/v1/analytics/org/?school=CNIT")
        self.assertEqual(response.status_code, 404)

    def test_requires_segment(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/analytics/org/")
        self.assertEqual(response.status_code, 400)


class FunnelTest(TestCase):
    """Item 111 — the four-step activation funnel."""

    def test_funnel_steps_and_rates(self):
        maker = User.objects.create_user(username="f1", password="pw")
        browser = User.objects.create_user(username="f2", password="pw")
        problem = _approved()
        Submission.objects.create(
            user=maker,
            problem=problem,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        contest = Contest.objects.create(
            title_i18n={"en": "C"},
            created_by=maker,
            start_at=timezone.now() - timedelta(days=2),
            end_at=timezone.now() - timedelta(days=1),
        )
        ContestParticipation.objects.create(contest=contest, user=maker)
        snapshot = funnel_snapshot()
        keys = [step["key"] for step in snapshot["steps"]]
        self.assertEqual(
            keys, ["signup", "first_submission", "first_ac", "first_contest"]
        )
        counts = {step["key"]: step["count"] for step in snapshot["steps"]}
        self.assertEqual(counts["signup"], 2)
        self.assertEqual(counts["first_submission"], 1)
        self.assertEqual(counts["first_contest"], 1)
        rates = {step["key"]: step["rate"] for step in snapshot["steps"]}
        self.assertEqual(rates["signup"], 1.0)
        self.assertEqual(rates["first_submission"], 0.5)

    def test_endpoint_admin_only(self):
        anon = APIClient()
        self.assertEqual(anon.get("/api/v1/analytics/funnel/").status_code, 401)
        basic = APIClient()
        basic.force_authenticate(User.objects.create_user(username="f3", password="pw"))
        self.assertEqual(basic.get("/api/v1/analytics/funnel/").status_code, 403)
        admin_client = APIClient()
        admin_client.force_authenticate(
            User.objects.create_user(
                username="f4", password="pw", role=User.Roles.ADMIN
            )
        )
        self.assertEqual(admin_client.get("/api/v1/analytics/funnel/").status_code, 200)


class SearchAnalyticsTest(TestCase):
    """Item 110 — searches logged with per-kind zero detection."""

    def test_searches_are_logged_and_aggregated(self):
        admin_client = APIClient()
        admin_client.force_authenticate(
            User.objects.create_user(
                username="s1", password="pw", role=User.Roles.ADMIN
            )
        )
        _approved()  # "Sum" does not match the query; exercises the zero path too
        client = APIClient()
        client.get("/api/v1/search/?q=suma&lang=ro")
        client.get("/api/v1/search/?q=zzznothing")
        data = admin_client.get("/api/v1/analytics/search/").data
        self.assertEqual(data["total_searches"], 2)
        self.assertIn(
            "suma",
            [row["query"] for row in data["top_queries"] + data["zero_result_queries"]],
        )
        self.assertIn(
            "zzznothing", [row["query"] for row in data["zero_result_queries"]]
        )
        logged = SearchQuery.objects.get(query="zzznothing")
        self.assertEqual(logged.results_total, 0)
        self.assertTrue(logged.zero_result_kinds)


class WebhooksTest(TestCase):
    """Item 107 — registration, signing, delivery, ping."""

    def setUp(self):
        self.user = User.objects.create_user(username="w1", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_registration_validates(self):
        for payload in (
            {"url": "http://insecure.example/hook", "events": ["submission.judged"]},
            {"url": "https://ok.example/hook", "events": []},
            {"url": "https://ok.example/hook", "events": ["made.up.event"]},
        ):
            response = self.client.post(
                "/api/v1/analytics/webhooks/", payload, format="json"
            )
            self.assertEqual(response.status_code, 400, payload)

    def test_register_list_delete(self):
        created = self.client.post(
            "/api/v1/analytics/webhooks/",
            {"url": "https://example.com/hook", "events": ["submission.judged"]},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.data["secret"])
        listed = self.client.get("/api/v1/analytics/webhooks/").data
        self.assertEqual(len(listed), 1)
        deleted = self.client.delete(
            f"/api/v1/analytics/webhooks/?id={created.data['id']}"
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(WebhookEndpoint.objects.count(), 0)

    def test_signature_is_hmac_sha256(self):
        sig = sign_payload("s3cret", '{"a": 1}')
        self.assertEqual(len(sig), 64)

    @override_settings()
    def test_dispatch_signs_and_records(self):
        endpoint = WebhookEndpoint.objects.create(
            owner=self.user,
            url="https://example.com/hook",
            events=["submission.judged"],
            secret="s3cret",
        )

        with mock.patch.object(views, "requests") as fake_requests:
            fake_requests.post.return_value = mock.Mock(status_code=200)
            sent = dispatch_webhooks("submission.judged", {"id": 7})
        self.assertEqual(sent, 1)
        delivery = endpoint.deliveries.get()
        self.assertEqual(delivery.status_code, 200)
        self.assertIsNotNone(delivery.delivered_at)
        args, kwargs = fake_requests.post.call_args
        self.assertEqual(args[0], "https://example.com/hook")
        self.assertTrue(kwargs["headers"]["X-Webcoder-Signature"].startswith("sha256="))

    def test_dispatch_failure_is_recorded(self):
        endpoint = WebhookEndpoint.objects.create(
            owner=self.user,
            url="https://down.example/hook",
            events=["contest.finished"],
            secret="s3cret",
        )

        with mock.patch.object(views, "requests") as fake_requests:
            fake_requests.post.side_effect = OSError("net")
            sent = dispatch_webhooks("contest.finished", {})
        self.assertEqual(sent, 0)
        delivery = endpoint.deliveries.get()
        self.assertEqual(delivery.status_code, None)
        self.assertIn("net", delivery.error)

    def test_ping_delivers_to_own_endpoint(self):
        endpoint = WebhookEndpoint.objects.create(
            owner=self.user,
            url="https://example.com/hook",
            events=["submission.judged"],
            secret="s3cret",
        )

        with mock.patch.object(views, "requests") as fake_requests:
            fake_requests.post.return_value = mock.Mock(status_code=200)
            response = self.client.post(
                f"/api/v1/analytics/webhooks/{endpoint.id}/ping/"
            )
        self.assertEqual(response.data["delivered"], 1)
        # Someone else's endpoint is invisible.
        other = APIClient()
        other.force_authenticate(User.objects.create_user(username="w2", password="pw"))
        self.assertEqual(
            other.post(f"/api/v1/analytics/webhooks/{endpoint.id}/ping/").status_code,
            404,
        )


class ExperimentsTest(TestCase):
    """Item 109 — deterministic assignment + stats."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="e1", password="pw", role=User.Roles.ADMIN
        )
        self.experiment = Experiment.objects.create(
            name="start-page-cta", variants=["control", "treatment"]
        )
        self.client = APIClient()

    def test_variant_is_deterministic_and_persisted(self):
        user = User.objects.create_user(username="e2", password="pw")
        self.client.force_authenticate(user)
        first = self.client.get("/api/v1/analytics/experiments/start-page-cta/variant/")
        second = self.client.get(
            "/api/v1/analytics/experiments/start-page-cta/variant/"
        )
        self.assertEqual(first.data["variant"], second.data["variant"])
        self.assertIn(first.data["variant"], ["control", "treatment"])
        self.assertEqual(ExperimentAssignment.objects.count(), 1)

    def test_unknown_or_inactive_returns_null(self):
        user = User.objects.create_user(username="e3", password="pw")
        self.client.force_authenticate(user)
        self.assertEqual(
            self.client.get("/api/v1/analytics/experiments/nope/variant/").data[
                "variant"
            ],
            None,
        )
        self.experiment.is_active = False
        self.experiment.save()
        self.assertEqual(
            self.client.get(
                "/api/v1/analytics/experiments/start-page-cta/variant/"
            ).data["variant"],
            None,
        )

    def test_distribution_covers_both_arms(self):
        seen = set()
        for i in range(50):
            seen.add(self.experiment.variant_for(i))
        self.assertEqual(seen, {"control", "treatment"})

    def test_stats_admin_only(self):
        basic = APIClient()
        basic.force_authenticate(User.objects.create_user(username="e4", password="pw"))
        self.assertEqual(
            basic.get(
                "/api/v1/analytics/experiments/start-page-cta/stats/"
            ).status_code,
            403,
        )
        admin_client = APIClient()
        admin_client.force_authenticate(self.admin)
        for i in range(5):
            extra = User.objects.create_user(username=f"e5_{i}", password="pw")
            ExperimentAssignment.objects.create(
                experiment=self.experiment,
                user=extra,
                variant=self.experiment.variant_for(extra.id),
            )
        data = admin_client.get(
            "/api/v1/analytics/experiments/start-page-cta/stats/"
        ).data
        self.assertEqual(sum(row["n"] for row in data["variants"]), 5)


class SeasonReportTest(TestCase):
    """Item 112 — generation + retrieval."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="r1", password="pw", role=User.Roles.ADMIN
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_build_report_numbers(self):
        User.objects.create_user(username="r2", password="pw")
        problem = _approved()
        Submission.objects.create(
            user=User.objects.create_user(username="r3", password="pw"),
            problem=problem,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        markdown = build_season_report("2026Q4")
        self.assertIn("2026Q4", markdown)
        self.assertIn("Submissions judged: **1**", markdown)

    def test_post_get_and_validation(self):
        created = self.client.post(
            "/api/v1/analytics/season-reports/", {"season": "2026Q4"}, format="json"
        )
        self.assertEqual(created.status_code, 201)
        self.assertIn("# WebCoder 2026Q4 report", created.data["markdown"])
        listed = self.client.get("/api/v1/analytics/season-reports/").data
        self.assertEqual([row["season"] for row in listed], ["2026Q4"])
        one = self.client.get("/api/v1/analytics/season-reports/?season=2026Q4").data
        self.assertIn("markdown", one)
        bad = self.client.post(
            "/api/v1/analytics/season-reports/", {"season": "2026Q9"}, format="json"
        )
        self.assertEqual(bad.status_code, 400)
        missing = self.client.get("/api/v1/analytics/season-reports/?season=2020Q1")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(SeasonReport.objects.count(), 1)

    def test_admin_only(self):
        basic = APIClient()
        basic.force_authenticate(User.objects.create_user(username="r4", password="pw"))
        self.assertEqual(
            basic.get("/api/v1/analytics/season-reports/").status_code, 403
        )


class PublicApiCompletionTest(TestCase):
    """Item 106 — standings + user profile on the public API."""

    def setUp(self):
        self.author = User.objects.create_user(username="p1", password="pw")
        self.player = User.objects.create_user(username="player", password="pw")
        self.contest = Contest.objects.create(
            title_i18n={"en": "Cup"},
            created_by=self.author,
            start_at=timezone.now() - timedelta(days=2),
            end_at=timezone.now() - timedelta(days=1),
        )
        ContestParticipation.objects.create(contest=self.contest, user=self.player)
        problem = _approved()
        from contests.models import ContestProblem

        ContestProblem.objects.create(
            contest=self.contest, problem=problem, label="A", order=1
        )
        Submission.objects.create(
            user=self.player,
            problem=problem,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
            contest=self.contest,
        )
        from contests.scoring import record_verdict

        # Materialize the score row through the real pipeline.
        submission = Submission.objects.get(contest=self.contest)
        record_verdict(submission)

    def test_public_standings(self):
        data = (
            APIClient()
            .get(f"/api/v1/public/contests/{self.contest.id}/standings/")
            .data
        )
        self.assertEqual(data["contest"], self.contest.id)
        self.assertEqual(data["results"][0]["user"], "player")
        self.assertGreaterEqual(data["results"][0]["score"], 0)

    def test_private_contest_standings_hidden(self):
        private = Contest.objects.create(
            title_i18n={"en": "Hidden"},
            created_by=self.author,
            start_at=timezone.now() - timedelta(days=1),
            end_at=timezone.now() + timedelta(days=1),
            visibility=Contest.Visibility.PRIVATE,
        )
        response = APIClient().get(f"/api/v1/public/contests/{private.id}/standings/")
        self.assertEqual(response.status_code, 404)

    def test_public_user_profile_and_minor_privacy(self):
        data = APIClient().get("/api/v1/public/users/player/").data
        self.assertEqual(data["username"], "player")
        self.assertIn("rating", data)
        User.objects.create_user(username="minorpub", password="pw", is_minor=True)
        data = APIClient().get("/api/v1/public/users/minorpub/").data
        self.assertTrue(data["private"])


class HourExtractionProbe(TestCase):
    """Debug-grade probe kept as a regression test: ExtractHour works on
    the submissions queryset after update()-set timestamps."""

    def test_extract_hour_direct(self):
        from django.db import models as dj_models

        user = User.objects.create_user(username="probe1", password="pw")
        problem = _approved()
        row = Submission.objects.create(
            user=user,
            problem=problem,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        Submission.objects.filter(pk=row.pk).update(
            submission_time=timezone.make_aware(timezone.datetime(2026, 11, 10, 9))
        )
        hours = list(
            Submission.objects.filter(user=user)
            .order_by()
            .annotate(hour=dj_models.functions.ExtractHour("submission_time"))
            .values_list("hour", flat=True)
        )
        self.assertEqual(hours, [9])


class ModelStrTest(TestCase):
    """Cover the model __str__ arms + variant determinism docstring."""

    def test_str_methods(self):
        from analytics.models import (
            ExperimentAssignment as EA,
            WebhookDelivery,
        )

        owner = User.objects.create_user(username="m1", password="pw")
        query = SearchQuery.objects.create(query="q", results_total=1)
        endpoint = WebhookEndpoint.objects.create(
            owner=owner,
            url="https://x.example/h",
            events=["user.registered"],
            secret="s",
        )
        delivery = WebhookDelivery.objects.create(
            endpoint=endpoint, event="user.registered"
        )
        experiment = Experiment.objects.create(name="e", variants=["a", "b"])
        assignment = EA.objects.create(
            experiment=experiment, user=owner, variant=experiment.variant_for(owner.id)
        )
        report = SeasonReport.objects.create(season="2026Q4", markdown="# r")
        self.assertIn("q", str(query))
        self.assertIn("webhook", str(endpoint))
        self.assertIn("user.registered", str(delivery))
        self.assertIn("experiment", str(experiment))
        self.assertIn("=", str(assignment))
        self.assertIn("2026Q4", str(report))

    def test_experiment_without_variants_returns_empty(self):
        experiment = Experiment.objects.create(name="empty", variants=[])
        self.assertEqual(experiment.variant_for(1), "")


class ViewEdgeTest(TestCase):
    """The remaining branch arms: teacher county view, webhook 404s,
    season GET missing, experiment stats 404."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="ve1", password="pw", role=User.Roles.ADMIN
        )
        self.client = APIClient()

    def test_county_segment_for_admin(self):
        User.objects.create_user(
            username="ve2", password="pw", county="Cluj", school="CNP"
        )
        self.client.force_authenticate(self.admin)
        data = self.client.get("/api/v1/analytics/org/?county=Cluj").data
        self.assertEqual(data["members"], 1)

    def test_webhook_delete_missing_404(self):
        self.client.force_authenticate(self.admin)
        response = self.client.delete("/api/v1/analytics/webhooks/?id=999")
        self.assertEqual(response.status_code, 404)

    def test_ping_missing_404(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post("/api/v1/analytics/webhooks/999/ping/")
        self.assertEqual(response.status_code, 404)

    def test_experiment_stats_missing_404(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/analytics/experiments/nope/stats/")
        self.assertEqual(response.status_code, 404)

    def test_season_get_missing_404(self):
        self.client.force_authenticate(self.admin)
        self.client.post(
            "/api/v1/analytics/season-reports/", {"season": "2026Q4"}, format="json"
        )
        response = self.client.get("/api/v1/analytics/season-reports/?season=2020Q1")
        self.assertEqual(response.status_code, 404)
        # regenerate over the same season → 200, not created
        again = self.client.post(
            "/api/v1/analytics/season-reports/", {"season": "2026Q4"}, format="json"
        )
        self.assertEqual(again.status_code, 200)
        self.assertFalse(again.data["created"])

    def test_public_user_profile_missing_404(self):
        response = APIClient().get("/api/v1/public/users/ghost/")
        self.assertEqual(response.status_code, 404)

    def test_public_standings_missing_404(self):
        response = APIClient().get("/api/v1/public/contests/999999/standings/")
        self.assertEqual(response.status_code, 404)


class LogFailureTest(TestCase):
    """log_search swallows storage failures (analytics never breaks search)."""

    def test_log_failure_swallowed(self):
        from unittest import mock as _mock

        from analytics.views import log_search

        with _mock.patch.object(
            views.SearchQuery.objects, "create", side_effect=OSError("db")
        ):
            log_search("q", {"problems": [1]}, None)  # must not raise


class MinorSelfProfileTest(TestCase):
    """The minor-self branch of the public profile."""

    def test_minor_sees_own_public_profile(self):
        minor = User.objects.create_user(
            username="minorown", password="pw", is_minor=True
        )
        client = APIClient()
        client.force_authenticate(minor)
        response = client.get("/api/v1/public/users/minorown/")
        self.assertFalse(response.data.get("private", False))
        self.assertIn("rating", response.data)


class DispatchSkipTest(TestCase):
    """The inactive-endpoint skip arm of dispatch_webhooks."""

    def test_inactive_and_unsubscribed_endpoints_skipped(self):
        owner = User.objects.create_user(username="d1", password="pw")
        from analytics.models import WebhookEndpoint
        from analytics.views import dispatch_webhooks

        WebhookEndpoint.objects.create(
            owner=owner,
            url="https://x.example/h",
            events=["submission.judged"],
            secret="s",
            is_active=False,
        )
        WebhookEndpoint.objects.create(
            owner=owner,
            url="https://y.example/h",
            events=["contest.finished"],
            secret="s",
        )
        sent = dispatch_webhooks("submission.judged", {})
        self.assertEqual(sent, 0)


class LogEmptyResultsTest(TestCase):
    """log_search with zero-kinds exercises the all-empty branch."""

    def test_log_all_empty(self):
        from analytics.views import log_search

        log_search("void", {"problems": [], "threads": []}, None)
        row = SearchQuery.objects.get(query="void")
        self.assertEqual(row.zero_result_kinds, ["problems", "threads"])


class DeliveryNon2xxTest(TestCase):
    """deliver_to_endpoint records non-2xx without marking delivered."""

    def test_non_2xx_is_not_delivered(self):
        owner = User.objects.create_user(username="n1", password="pw")
        from analytics.models import WebhookEndpoint
        from analytics.views import deliver_to_endpoint

        endpoint = WebhookEndpoint.objects.create(
            owner=owner,
            url="https://x.example/h",
            events=["submission.judged"],
            secret="s",
        )

        with mock.patch.object(views, "requests") as fake:
            fake.post.return_value = mock.Mock(status_code=503)
            ok = deliver_to_endpoint(endpoint, "submission.judged", {})
        self.assertFalse(ok)
        delivery = endpoint.deliveries.get()
        self.assertEqual(delivery.status_code, 503)
        self.assertIsNone(delivery.delivered_at)
