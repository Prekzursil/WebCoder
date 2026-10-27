"""Wave-B polish-pack tests: RO-3/LEG-2 identity + leaderboard segments,
COM-6 announcements, SAF-2 verified-email gate for rated contests."""

from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from allauth.account.models import EmailAddress
from contests.models import Contest, ContestProblem
from forum.models import Post, Thread
from leaderboard.models import LeaderboardEntry
from problems.models import Problem
from users.models import User
from users.serializers import UserSerializer


def _user(username, **kw):
    return User.objects.create_user(username=username, password="pw", **kw)


class MinorProfileSuppressionTest(TestCase):
    """LEG-2: minors' county/school never render for other viewers."""

    def setUp(self):
        self.client = APIClient()
        self.minor = _user("minor", is_minor=True, county="Ilfov", school="Liceul X")
        self.adult = _user("adult", county="Cluj", school="Liceul Y")
        self.admin = _user("boss", role=User.Roles.ADMIN)

    def _serialize(self, obj, viewer):
        request = mock.Mock(user=viewer)
        return UserSerializer(obj, context={"request": request}).data

    def test_minor_fields_hidden_from_others(self):
        data = self._serialize(self.minor, self.adult)
        self.assertEqual(data["county"], "")
        self.assertEqual(data["school"], "")
        self.assertTrue(data["is_minor"])

    def test_minor_sees_own_fields(self):
        data = self._serialize(self.minor, self.minor)
        self.assertEqual(data["county"], "Ilfov")

    def test_admin_sees_minor_fields(self):
        data = self._serialize(self.minor, self.admin)
        self.assertEqual(data["school"], "Liceul X")

    def test_adult_fields_public(self):
        data = self._serialize(self.adult, self.minor)
        self.assertEqual(data["county"], "Cluj")


class LeaderboardSegmentsTest(TestCase):
    """RO-3: county/school segments; LEG-2: minors excluded from segments."""

    def setUp(self):
        self.client = APIClient()
        self.u1 = _user("cluj1", county="Cluj", school="A")
        self.u2 = _user("cluj2", county="Cluj")
        self.u3 = _user("ilfov", county="Ilfov")
        self.u4 = _user("minor", county="Cluj", is_minor=True)
        for u, pts in ((self.u1, 50), (self.u2, 30), (self.u3, 20), (self.u4, 99)):
            LeaderboardEntry.objects.create(
                user=u, total_points=pts, solved_count=pts // 10
            )

    def test_county_segment(self):
        response = self.client.get("/api/v1/leaderboard/", {"county": "Cluj"})
        usernames = [row["username"] for row in response.data["results"]]
        # The minor (99 pts) must NOT appear in the segmented board.
        self.assertEqual(sorted(usernames), ["cluj1", "cluj2"])

    def test_school_segment_case_insensitive(self):
        response = self.client.get("/api/v1/leaderboard/", {"school": "a"})
        usernames = [row["username"] for row in response.data["results"]]
        self.assertEqual(usernames, ["cluj1"])

    def test_global_board_still_lists_minors(self):
        # Only *segments* exclude minors; the global practice board is intact.
        response = self.client.get("/api/v1/leaderboard/")
        usernames = [row["username"] for row in response.data["results"]]
        self.assertIn("minor", usernames)


class AnnouncementThreadsTest(TestCase):
    """COM-6: is_announcement flag, moderator-only lever, filter feed."""

    def setUp(self):
        self.client = APIClient()
        self.author = _user("author")
        self.verifier = _user("verifier", role=User.Roles.PROBLEM_VERIFIER)
        self.news = Thread.objects.create(
            title="News", author=self.verifier, is_announcement=True
        )
        self.plain = Thread.objects.create(title="Plain", author=self.author)
        Post.objects.create(thread=self.news, author=self.verifier, content="x")

    def test_list_exposes_flag(self):
        response = self.client.get("/api/v1/forum/threads/")
        flags = {row["id"]: row["is_announcement"] for row in response.data["results"]}
        self.assertTrue(flags[self.news.id])
        self.assertFalse(flags[self.plain.id])

    def test_announcements_filter(self):
        response = self.client.get("/api/v1/forum/threads/", {"announcements": "1"})
        self.assertEqual(
            [row["title"] for row in response.data["results"]], ["News"]
        )

    def test_author_cannot_self_promote_to_announcement(self):
        self.client.force_authenticate(self.author)
        response = self.client.patch(
            f"/api/v1/forum/threads/{self.plain.id}/",
            {"is_announcement": True},
            format="json",
        )
        self.plain.refresh_from_db()
        self.assertFalse(self.plain.is_announcement)

    def test_plain_title_update_untouched_by_guard(self):
        # A title-only PATCH carries no announcement flag — the guard must
        # leave it alone (branch: flag absent in validated_data).
        self.client.force_authenticate(self.author)
        response = self.client.patch(
            f"/api/v1/forum/threads/{self.plain.id}/",
            {"title": "Renamed"},
            format="json",
        )
        self.plain.refresh_from_db()
        self.assertEqual(self.plain.title, "Renamed")

    def test_author_same_value_flag_is_noop(self):
        # Guard inner check: re-asserting the CURRENT value changes nothing.
        self.client.force_authenticate(self.author)
        response = self.client.patch(
            f"/api/v1/forum/threads/{self.plain.id}/",
            {"is_announcement": False},
            format="json",
        )
        self.plain.refresh_from_db()
        self.assertFalse(self.plain.is_announcement)

    def test_moderator_can_flag_announcement(self):
        self.client.force_authenticate(self.verifier)
        response = self.client.patch(
            f"/api/v1/forum/threads/{self.plain.id}/",
            {"is_announcement": True},
            format="json",
        )
        self.plain.refresh_from_db()
        self.assertTrue(self.plain.is_announcement)


class RatedContestVerifiedEmailTest(TestCase):
    """SAF-2: rated registration needs a verified email; env-gated."""

    def setUp(self):
        self.client = APIClient()
        self.user = _user("bob")
        now = timezone.now()
        self.problem = Problem.objects.create(
            title_i18n={"en": "P", "ro": "P"},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )
        self.rated = Contest.objects.create(
            title_i18n={"en": "Rated", "ro": "Rated"},
            created_by=_user("org"),
            start_at=now + timedelta(minutes=10),
            end_at=now + timedelta(minutes=100),
            is_rated=True,
        )
        ContestProblem.objects.create(
            contest=self.rated, problem=self.problem, order=0, points=100
        )
        self.unrated = Contest.objects.create(
            title_i18n={"en": "Friendly", "ro": "Friendly"},
            created_by=_user("org2"),
            start_at=now + timedelta(minutes=10),
            end_at=now + timedelta(minutes=100),
            is_rated=False,
        )

    def test_rated_registration_requires_verified_email(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(f"/api/v1/contests/{self.rated.id}/register/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("verified email", response.data["detail"])

    def test_rated_registration_with_verified_email(self):
        EmailAddress.objects.create(
            user=self.user, email="bob@example.com", verified=True
        )
        self.client.force_authenticate(self.user)
        response = self.client.post(f"/api/v1/contests/{self.rated.id}/register/")
        self.assertEqual(response.status_code, 201, response.data)

    def test_unrated_registration_needs_no_email(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(f"/api/v1/contests/{self.unrated.id}/register/")
        self.assertEqual(response.status_code, 201, response.data)

    @override_settings(RATED_CONTESTS_REQUIRE_VERIFIED_EMAIL=False)
    def test_env_gate_disables_the_check(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(f"/api/v1/contests/{self.rated.id}/register/")
        self.assertEqual(response.status_code, 201, response.data)
