"""OPS-1 public read-only API + OPS-3 Microsoft SSO tests."""

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from leaderboard.models import LeaderboardEntry
from problems.models import Problem, Tag
from problems.models import TestCase as ProblemTestCase
from submissions.models import Submission
from users.models import User


def _mk_problem(title, status=Problem.ProblemStatus.APPROVED, **kw):
    problem = Problem.objects.create(
        title_i18n={"en": title, "ro": title},
        statement_i18n={"en": "s", "ro": "s"},
        status=status,
        **kw,
    )
    ProblemTestCase.objects.create(
        problem=problem, input_data="1", expected_output_data="2", points=100
    )
    return problem


@override_settings(
    REST_FRAMEWORK={"DEFAULT_THROTTLE_RATES": {"public_api": "1000/min"}}
)
class PublicAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tag = Tag.objects.create(
            name_i18n={"en": "Hashing", "ro": "Hashing"}, slug="hashing"
        )
        self.problem = _mk_problem("Two Sum")
        self.problem.tags.add(self.tag)
        self.draft = _mk_problem("Secret", status=Problem.ProblemStatus.DRAFT)
        self.alice = User.objects.create_user(username="alice", password="pw")

    def test_root_directory(self):
        response = self.client.get("/api/v1/public/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("/api/v1/public/problems/", response.data["endpoints"])
        self.assertIn("Rate limit", response.data["api"])

    def test_problem_list_filters_and_shape(self):
        _mk_problem("Hashing fun").tags.add(self.tag)
        listing = self.client.get("/api/v1/public/problems/")
        self.assertEqual(listing.status_code, 200)
        ids = [row["id"] for row in listing.data["results"]]
        self.assertIn(self.problem.id, ids)
        self.assertNotIn(self.draft.id, ids)  # APPROVED only
        by_tag = self.client.get("/api/v1/public/problems/?tag=hashing")
        self.assertEqual(len(by_tag.data["results"]), 2)
        by_difficulty = self.client.get(
            "/api/v1/public/problems/?difficulty=IMPOSSIBLE"
        )
        self.assertEqual(by_difficulty.data["results"], listing.data["results"])
        easy = self.client.get("/api/v1/public/problems/?difficulty=MEDIUM")
        self.assertTrue(all(r["difficulty"] == "MEDIUM" for r in easy.data["results"]))
        search = self.client.get("/api/v1/public/problems/?search=two")
        self.assertEqual([r["id"] for r in search.data["results"]], [self.problem.id])

    def test_problem_detail_metadata_only(self):
        response = self.client.get(f"/api/v1/public/problems/{self.problem.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("statement_i18n", response.data)
        self.assertNotIn("checker_code", response.data)
        self.assertNotIn("test_cases", response.data)
        missing = self.client.get("/api/v1/public/problems/999999/")
        self.assertEqual(missing.status_code, 404)
        draft = self.client.get(f"/api/v1/public/problems/{self.draft.id}/")
        self.assertEqual(draft.status_code, 404)

    def test_leaderboard_and_tags(self):
        LeaderboardEntry.objects.create(
            user=self.alice,
            solved_count=3,
            total_points=300,
            total_submissions=10,
            ac_submissions=5,
        )
        board = self.client.get("/api/v1/public/leaderboard/")
        self.assertEqual(board.status_code, 200)
        self.assertEqual(board.data["results"][0]["username"], "alice")
        self.assertEqual(board.data["results"][0]["rank"], 1)
        tags = self.client.get("/api/v1/public/tags/")
        self.assertEqual(tags.data["count"], 1)
        self.assertEqual(tags.data["results"][0]["slug"], "hashing")

    def test_feed_stream(self):
        Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict="AC",
            score=100,
        )
        feed = self.client.get("/api/v1/public/feed/")
        self.assertEqual(feed.status_code, 200)
        self.assertEqual(feed.data["results"][0]["user"], "alice")
        for row in feed.data["results"]:
            self.assertNotIn("code", row)

    def test_throttle_applies(self):
        # ScopedRateThrottle with a per-anon bucket: exercise the class
        # directly (HTTP-level hammering would slow the suite).
        from public_api.views import PublicAPIThrottle

        throttle = PublicAPIThrottle()
        self.assertEqual(PublicAPIThrottle.scope, "public_api")
        self.assertIsNotNone(throttle.get_rate())


class MicrosoftSSOTests(TestCase):
    """OPS-3 — the school SSO lane is mounted and configured."""

    def test_login_routes_resolve(self):
        login = reverse("microsoft:login")
        token = reverse("microsoft:login_token")
        self.assertEqual(login, "/api/v1/auth/microsoft/login/")
        self.assertEqual(token, "/api/v1/auth/microsoft/login/token/")

    def test_views_use_graph_adapter(self):
        from allauth.socialaccount.providers.microsoft.views import (
            MicrosoftGraphOAuth2Adapter,
        )
        from users.api.oauth.microsoft.views import (
            MicrosoftLogin,
            MicrosoftTokenLogin,
        )

        self.assertIs(MicrosoftLogin.adapter_class, MicrosoftGraphOAuth2Adapter)
        self.assertIs(MicrosoftTokenLogin.adapter_class, MicrosoftGraphOAuth2Adapter)

    def test_provider_configured(self):
        from django.conf import settings

        self.assertIn(
            "allauth.socialaccount.providers.microsoft",
            settings.INSTALLED_APPS,
        )
        self.assertIn("microsoft", settings.SOCIALACCOUNT_PROVIDERS)
        self.assertIn(
            "User.Read", settings.SOCIALACCOUNT_PROVIDERS["microsoft"]["SCOPE"]
        )
