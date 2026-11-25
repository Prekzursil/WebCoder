"""Wave G PR3 backend tests — items 82 (federated search), 84
(notification digests), 88 (onboarding checklist), 90 (minor-safe public
profiles)."""

from datetime import timedelta

from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from forum.models import Thread
from notifications.models import Notification
from problems.models import Article, Problem
from rest_framework.test import APIClient
from users.models import User

from contests.models import Contest
from notifications.tasks import notification_digest_task
from webcoder_api.search import LIMITS


def _approved_problem(title_en="Sum", statement_en="Add numbers", **extra):
    return Problem.objects.create(
        title_i18n={"en": title_en, "ro": "Suma"},
        statement_i18n={"en": statement_en},
        status=Problem.ProblemStatus.APPROVED,
        **extra,
    )


class FederatedSearchTest(TestCase):
    """Item 82 — one query, grouped public results."""

    def setUp(self):
        self.author = User.objects.create_user(username="auth", password="pw")
        self.problem = _approved_problem("Two Sum")
        Problem.objects.create(
            title_i18n={"en": "Draft thing"},
            statement_i18n={"en": "x"},
            status=Problem.ProblemStatus.DRAFT,
        )
        self.thread = Thread.objects.create(
            title="Two Sum approaches", author=self.author
        )
        Thread.objects.create(
            title="Hidden Two Sum talk", author=self.author, is_hidden=True
        )
        self.article = Article.objects.create(
            title_i18n={"en": "Two pointers"},
            body_en="Classic two sum technique.",
            status=Article.Status.APPROVED,
            author=self.author,
        )
        Contest.objects.create(
            title_i18n={"en": "Two Sum Cup"},
            created_by=self.author,
            start_at=timezone.now() + timedelta(days=1),
            end_at=timezone.now() + timedelta(days=2),
            visibility=Contest.Visibility.PUBLIC,
        )
        Contest.objects.create(
            title_i18n={"en": "Secret Sum Cup"},
            created_by=self.author,
            start_at=timezone.now() + timedelta(days=1),
            end_at=timezone.now() + timedelta(days=2),
            visibility=Contest.Visibility.PRIVATE,
        )
        User.objects.create_user(username="twosummer", password="pw")
        self.client = APIClient()

    def test_short_query_returns_empty_groups(self):
        response = self.client.get("/api/v1/search/?q=t")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], {})

    def test_federated_results_grouped_and_public_only(self):
        response = self.client.get("/api/v1/search/?q=two sum")
        self.assertEqual(response.status_code, 200)
        results = response.data["results"]
        self.assertIn("Two Sum", [row["title"] for row in results["problems"]])
        self.assertIn(
            "Two Sum approaches", [row["title"] for row in results["threads"]]
        )
        self.assertNotIn(
            "Hidden Two Sum talk", [row["title"] for row in results["threads"]]
        )
        self.assertIn("Two pointers", [row["title"] for row in results["articles"]])
        self.assertIn("Two Sum Cup", [row["title"] for row in results["contests"]])
        self.assertNotIn(
            "Secret Sum Cup", [row["title"] for row in results["contests"]]
        )
        # Handles have no spaces — a second, username-shaped query.
        user_query = self.client.get("/api/v1/search/?q=twosummer").data["results"]
        self.assertIn("twosummer", [row["username"] for row in user_query["users"]])
        # Drafts never leak.
        self.assertNotIn("Draft thing", [row["title"] for row in results["problems"]])

    def test_per_kind_caps(self):
        for i in range(LIMITS["problems"] + 3):
            _approved_problem(f"Two Sum variant {i}")
        response = self.client.get("/api/v1/search/?q=two sum")
        self.assertLessEqual(
            len(response.data["results"]["problems"]), LIMITS["problems"]
        )


class NotificationDigestTest(TestCase):
    """Item 84 — per-user digest frequency, one email, marks read."""

    def setUp(self):
        self.daily = User.objects.create_user(
            username="daily", password="pw", email="daily@example.com"
        )
        self.daily.notification_digest = "daily"
        self.daily.save()
        self.weekly = User.objects.create_user(
            username="weekly", password="pw", email="weekly@example.com"
        )
        self.weekly.notification_digest = "weekly"
        self.weekly.save()
        self.none = User.objects.create_user(
            username="nodigest", password="pw", email="none@example.com"
        )
        for user in (self.daily, self.weekly, self.none):
            Notification.objects.create(recipient=user, verb="SYSTEM")

    def test_no_mail_host_is_a_noop(self):
        with self.settings(EMAIL_HOST=""):
            sent = notification_digest_task("daily")
        self.assertEqual(sent, 0)

    def test_bad_period_raises(self):
        with self.assertRaises(ValueError):
            notification_digest_task("hourly")

    @override_settings(EMAIL_HOST="smtp.example.com")
    def test_daily_digest_sends_once_and_marks_read(self):
        sent = notification_digest_task("daily")
        self.assertEqual(sent, 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("daily@example.com", mail.outbox[0].to)
        self.assertIn("1", mail.outbox[0].subject)
        # Digested notifications are read; other users untouched.
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.daily, read_at__isnull=True
            ).count(),
            0,
        )
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.weekly, read_at__isnull=True
            ).count(),
            1,
        )

    @override_settings(EMAIL_HOST="smtp.example.com")
    def test_weekly_digest_picks_weekly_users(self):
        sent = notification_digest_task("weekly")
        self.assertEqual(sent, 1)
        self.assertEqual(mail.outbox[0].to, ["weekly@example.com"])

    @override_settings(EMAIL_HOST="smtp.example.com")
    def test_no_unread_means_no_email(self):
        Notification.objects.all().delete()
        self.assertEqual(notification_digest_task("daily"), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_digest_preference_roundtrips_through_me(self):
        client = APIClient()
        client.force_authenticate(self.none)
        client.patch(
            "/api/v1/users/me/", {"notification_digest": "weekly"}, format="json"
        )
        self.none.refresh_from_db()
        self.assertEqual(self.none.notification_digest, "weekly")


class OnboardingChecklistTest(TestCase):
    """Item 88 — computed first-hour steps."""

    def setUp(self):
        self.user = User.objects.create_user(username="newbie", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_requires_auth(self):
        self.assertEqual(
            APIClient().get("/api/v1/users/me/onboarding/").status_code, 401
        )

    def test_fresh_account_has_only_the_account_step(self):
        data = self.client.get("/api/v1/users/me/onboarding/").data
        self.assertEqual(data["done"], 1)
        self.assertEqual(data["total"], 6)
        by_key = {step["key"]: step["done"] for step in data["steps"]}
        self.assertTrue(by_key["account"])
        self.assertFalse(by_key["first_submission"])

    def test_steps_light_up(self):
        problem = _approved_problem()
        from submissions.models import Submission

        Submission.objects.create(
            user=self.user,
            problem=problem,
            language="python3",
            code="print(1)",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        self.user.bio = "hello"
        self.user.save()
        data = self.client.get("/api/v1/users/me/onboarding/").data
        by_key = {step["key"]: step["done"] for step in data["steps"]}
        self.assertTrue(by_key["first_submission"])
        self.assertTrue(by_key["first_ac"])
        self.assertTrue(by_key["profile_bio"])
        self.assertFalse(by_key["first_contest"])
        self.assertFalse(by_key["joined_class"])
        self.assertEqual(data["done"], 4)


class MinorSafeProfileTest(TestCase):
    """Item 90 — minors' public profiles default non-public."""

    def setUp(self):
        self.minor = User.objects.create_user(
            username="minor1", password="pw", is_minor=True, bio="hi"
        )
        self.adult = User.objects.create_user(
            username="adult1", password="pw", bio="yo"
        )
        self.admin = User.objects.create_user(
            username="root1", password="pw", role=User.Roles.ADMIN
        )

    def _history(self, username):
        return APIClient().get(f"/api/v1/ratings/users/{username}/")

    def test_anonymous_gets_private_marker_only(self):
        response = self._history("minor1")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["private"])
        self.assertNotIn("history", response.data)
        self.assertNotIn("bio", response.data)

    def test_other_user_also_private(self):
        client = APIClient()
        client.force_authenticate(self.adult)
        response = client.get("/api/v1/ratings/users/minor1/")
        self.assertTrue(response.data.get("private"))

    def test_self_and_admin_see_the_full_profile(self):
        client = APIClient()
        client.force_authenticate(self.minor)
        response = client.get("/api/v1/ratings/users/minor1/")
        self.assertFalse(response.data.get("private", False))
        self.assertIn("history", response.data)

        admin_client = APIClient()
        admin_client.force_authenticate(self.admin)
        response = admin_client.get("/api/v1/ratings/users/minor1/")
        self.assertFalse(response.data.get("private", False))

    def test_adults_stay_public(self):
        response = self._history("adult1")
        self.assertFalse(response.data.get("private", False))
        self.assertIn("history", response.data)

    def test_consent_field_default_null(self):
        self.assertIsNone(self.minor.parental_consent_at)


class FederatedSearchLocaleTest(TestCase):
    """Item 82 — locale preference and the non-dict title arm."""

    def test_lang_param_and_string_titles(self):
        _approved_problem()
        client = APIClient()
        ro = client.get("/api/v1/search/?q=suma&lang=ro").data["results"]
        self.assertGreaterEqual(len(ro["problems"]), 1)
        # An invalid locale falls back to English without error.
        bad = client.get("/api/v1/search/?q=sum&lang=zz")
        self.assertEqual(bad.status_code, 200)
        self.assertEqual(bad.data["results"]["problems"][0]["title"], "Sum")

    def test_string_title_field_arm(self):
        # A problem whose title_i18n is a plain string exercises the
        # non-dict branch of _i18n_text.
        Problem.objects.create(
            title_i18n="Stringtitled",
            statement_i18n="s",
            status=Problem.ProblemStatus.APPROVED,
        )
        data = APIClient().get("/api/v1/search/?q=stringtitled").data["results"]
        self.assertEqual(data["problems"][0]["title"], "Stringtitled")
