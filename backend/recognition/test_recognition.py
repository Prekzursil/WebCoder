"""Wave F — recognition tests (items 66/67/68/69).

Reputation tiers + privileges (66), community awards incl. the monthly
derivation (67), AMA sessions with the host gate (68) and the
problem-request board (69).
"""

from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from forum.models import Post, Thread
from problems.models import Problem
from recognition.models import (
    AmaQuestion,
    AmaSession,
    AmaVote,
    CommunityAward,
    ProblemRequest,
    ProblemRequestVote,
)
from recognition.reputation import (
    REPUTATION_TIERS,
    can_host_ama,
    next_tier,
    tier_for,
    user_reputation,
)
from recognition.tasks import award_monthly_contributors
from users.models import User


class RecognitionBase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.client = APIClient()
        self.now = timezone.now()

    def grant_honor(self, user, honor):
        """Honor derives from contributions; the cheapest source is
        approved problems (10 honor each)."""
        for i in range(honor // 10):
            Problem.objects.create(
                title_i18n={"en": f"P{i}", "ro": f"P{i}"},
                statement_i18n={"en": "s", "ro": "s"},
                status=Problem.ProblemStatus.APPROVED,
                author=user,
            )


class ReputationTests(RecognitionBase):
    def test_tier_boundaries(self):
        self.assertEqual(tier_for(0), "Newcomer")
        self.assertEqual(tier_for(24), "Newcomer")
        self.assertEqual(tier_for(25), "Contributor")
        self.assertEqual(tier_for(100), "Trusted")
        self.assertEqual(tier_for(300), "Mentor")
        self.assertEqual(tier_for(1000), "Legend")
        self.assertEqual(next_tier(0), ("Contributor", 25))
        self.assertIsNone(next_tier(1000))

    def test_user_reputation_privileges(self):
        self.grant_honor(self.alice, 30)
        profile = user_reputation(self.alice)
        self.assertEqual(profile["honor"], 30)
        self.assertEqual(profile["tier"], "Contributor")
        self.assertIn("blog_publish", profile["privileges"])
        self.assertEqual(profile["next_tier"], {"name": "Trusted", "honor_needed": 70})
        self.assertEqual(len(profile["tiers"]), len(REPUTATION_TIERS))

    def test_ama_host_gate(self):
        self.assertFalse(can_host_ama(self.alice))
        self.assertTrue(can_host_ama(self.admin))
        self.grant_honor(self.bob, 300)
        self.assertTrue(can_host_ama(self.bob))
        self.assertFalse(can_host_ama(None))

    def test_endpoints(self):
        self.client.force_authenticate(self.alice)
        response = self.client.get("/api/v1/community/reputation/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["tier"], "Newcomer")
        response = self.client.get("/api/v1/community/reputation/tiers/")
        self.assertEqual(len(response.data["tiers"]), 5)
        self.client.force_authenticate(None)
        response = self.client.get("/api/v1/community/reputation/me/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class AwardTests(RecognitionBase):
    def test_admin_grant_and_public_listing(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/community/awards/grant/",
            {"username": "alice", "kind": "HELPING_HAND", "reason": "WA queue hero"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        response = self.client.get("/api/v1/community/awards/")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["username"], "alice")
        # Username filter narrows.
        response = self.client.get("/api/v1/community/awards/?username=bob")
        self.assertEqual(response.data["count"], 0)

    def test_grant_requires_admin(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            "/api/v1/community/awards/grant/",
            {"username": "alice", "kind": "LEGEND"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_grant_unknown_user(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/community/awards/grant/",
            {"username": "ghost", "kind": "LEGEND"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def _early_month_now(self):
        # A day inside the award window (first week of the month).
        return self.now.replace(day=3)

    def test_monthly_award_task_idempotent(self):
        from unittest import mock

        self.grant_honor(self.alice, 20)
        with mock.patch(
            "recognition.tasks.timezone.now", return_value=self._early_month_now()
        ):
            result = award_monthly_contributors()
            self.assertTrue(result.startswith("awarded"), result)
            self.assertTrue(
                CommunityAward.objects.filter(
                    kind=CommunityAward.Kind.CONTRIBUTOR_OF_MONTH
                ).exists()
            )
            # Re-run: already awarded for the period.
            result = award_monthly_contributors()
            self.assertIn("already awarded", result)

    def test_monthly_award_task_window_and_empty(self):
        from unittest import mock

        # Late in the month: outside the award window.
        late = self.now.replace(day=20)
        with mock.patch("recognition.tasks.timezone.now", return_value=late):
            self.assertEqual(award_monthly_contributors(), "not in award window")
        # Empty platform: no contributors to award.
        with mock.patch(
            "community_depth.services.user_honor",
            side_effect=lambda user: {"honor": 0, "breakdown": {}, "weights": {}},
        ):
            CommunityAward.objects.all().delete()
            with mock.patch(
                "recognition.tasks.timezone.now",
                return_value=self._early_month_now(),
            ):
                self.assertEqual(
                    award_monthly_contributors(), "no contributors to award"
                )

    def test_str_methods(self):
        award = CommunityAward.objects.create(
            user=self.alice, kind=CommunityAward.Kind.MEDALIST
        )
        session = AmaSession.objects.create(
            host=self.alice,
            title="AMA",
            description="d",
            starts_at=self.now,
            ends_at=self.now + timedelta(hours=2),
        )
        question = AmaQuestion.objects.create(
            session=session, author=self.bob, question="?"
        )
        vote = AmaVote.objects.create(user=self.bob, question=question)
        request = ProblemRequest.objects.create(
            requester=self.bob, title="T", description="d"
        )
        request_vote = ProblemRequestVote.objects.create(
            user=self.alice, request=request
        )
        for obj in (award, session, question, vote, request, request_vote):
            self.assertTrue(str(obj))


from unittest import mock  # noqa: E402  (used by test_monthly_award_task_window)


class AmaTests(RecognitionBase):
    def setUp(self):
        super().setUp()
        self.grant_honor(self.alice, 300)  # Mentor tier → may host

    def mk_session(self, host=None, **kwargs):
        defaults = dict(
            host=host or self.alice,
            title="Ask me about ONI",
            description="I medaled 3 times.",
            starts_at=self.now - timedelta(minutes=10),
            ends_at=self.now + timedelta(hours=2),
        )
        defaults.update(kwargs)
        return AmaSession.objects.create(**defaults)

    def test_host_gate_and_create(self):
        self.client.force_authenticate(self.bob)
        response = self.client.post(
            "/api/v1/community/amas/",
            {
                "title": "T",
                "description": "d",
                "starts_at": "2026-12-01T18:00:00Z",
                "ends_at": "2026-12-01T20:00:00Z",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Mentor", str(response.data["detail"]))
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            "/api/v1/community/amas/",
            {
                "title": "T",
                "description": "d",
                "starts_at": "2026-12-01T18:00:00Z",
                "ends_at": "2026-12-01T20:00:00Z",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        # End before start is rejected.
        response = self.client.post(
            "/api/v1/community/amas/",
            {
                "title": "T2",
                "description": "d",
                "starts_at": "2026-12-01T20:00:00Z",
                "ends_at": "2026-12-01T18:00:00Z",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_ask_answer_upvote_flow(self):
        session = self.mk_session()
        self.client.force_authenticate(self.bob)
        response = self.client.post(
            f"/api/v1/community/amas/{session.id}/questions/",
            {"question": "How did you train?"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        question_id = response.data["id"]
        # Upvote toggles.
        response = self.client.post(
            f"/api/v1/community/amas/questions/{question_id}/upvote/"
        )
        self.assertTrue(response.data["voted"])
        response = self.client.post(
            f"/api/v1/community/amas/questions/{question_id}/upvote/"
        )
        self.assertFalse(response.data["voted"])
        # Only the host answers.
        response = self.client.post(
            f"/api/v1/community/amas/questions/{question_id}/answer/",
            {"answer": "lots of drills"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/community/amas/questions/{question_id}/answer/",
            {"answer": "lots of drills"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        detail = self.client.get(f"/api/v1/community/amas/{session.id}/")
        self.assertEqual(detail.data["status"], "LIVE")
        self.assertEqual(detail.data["questions"][0]["answer"], "lots of drills")

    def test_questions_closed_outside_window(self):
        session = self.mk_session(
            starts_at=self.now + timedelta(days=1),
            ends_at=self.now + timedelta(days=1, hours=2),
        )
        self.client.force_authenticate(self.bob)
        response = self.client.post(
            f"/api/v1/community/amas/{session.id}/questions/",
            {"question": "early?"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_anonymous_guards_and_closed_state(self):
        session = self.mk_session()
        question = AmaQuestion.objects.create(
            session=session, author=self.bob, question="?"
        )
        response = self.client.post(
            "/api/v1/community/amas/", {"title": "x"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        response = self.client.post(
            f"/api/v1/community/amas/{session.id}/questions/", {"question": "q"}
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        response = self.client.post(
            f"/api/v1/community/amas/questions/{question.id}/answer/", {"answer": "a"}
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        response = self.client.post(
            f"/api/v1/community/amas/questions/{question.id}/upvote/"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        # A closed session reports CLOSED and refuses new questions.
        closed = self.mk_session(
            starts_at=self.now - timedelta(days=2),
            ends_at=self.now - timedelta(days=2, hours=-2),
        )
        self.assertEqual(closed.status(), "CLOSED")

    def test_list_and_404s(self):
        self.mk_session()
        response = self.client.get("/api/v1/community/amas/")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["status"], "LIVE")
        self.client.force_authenticate(self.bob)
        response = self.client.post("/api/v1/community/amas/999/questions/", {"question": "x"})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.post("/api/v1/community/amas/questions/999/answer/", {"answer": "x"})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.post("/api/v1/community/amas/questions/999/upvote/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.get("/api/v1/community/amas/999/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        # Non-hosts may not even schedule (item 66 gate).
        response = self.client.post(
            "/api/v1/community/amas/",
            {
                "title": "t",
                "description": "d",
                "starts_at": "2026-12-01T18:00:00Z",
                "ends_at": "2026-12-01T20:00:00Z",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        # Hosts sending incomplete payloads get field errors.
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            "/api/v1/community/amas/", {"title": "t", "description": "d"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ProblemRequestTests(RecognitionBase):
    def test_open_vote_and_triage(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            "/api/v1/community/problem-requests/",
            {"title": "More graph problems", "description": "Please!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        request_id = response.data["id"]
        # Bob votes twice: on then off then on.
        self.client.force_authenticate(self.bob)
        response = self.client.post(
            f"/api/v1/community/problem-requests/{request_id}/vote/"
        )
        self.assertTrue(response.data["voted"])
        self.assertEqual(response.data["votes"], 1)
        response = self.client.post(
            f"/api/v1/community/problem-requests/{request_id}/vote/"
        )
        self.assertFalse(response.data["voted"])
        self.assertEqual(response.data["votes"], 0)
        self.client.post(f"/api/v1/community/problem-requests/{request_id}/vote/")
        # Board is ordered by votes.
        response = self.client.get("/api/v1/community/problem-requests/")
        self.assertEqual(response.data["results"][0]["vote_count"], 1)
        # Admin triage: planned then fulfilled with a problem.
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/api/v1/community/problem-requests/{request_id}/status/",
            {"status": "PLANNED"},
            format="json",
        )
        self.assertEqual(response.data["status"], "PLANNED")
        problem = Problem.objects.create(
            title_i18n={"en": "Graphs galore", "ro": "Grafuri"},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )
        response = self.client.post(
            f"/api/v1/community/problem-requests/{request_id}/status/",
            {"status": "FULFILLED", "problem_id": problem.id},
            format="json",
        )
        self.assertEqual(response.data["status"], "FULFILLED")
        self.assertEqual(response.data["fulfilled_problem"], problem.id)

    def test_triage_guards(self):
        row = ProblemRequest.objects.create(
            requester=self.alice, title="T", description="d"
        )
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/community/problem-requests/{row.id}/status/",
            {"status": "DECLINED"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/api/v1/community/problem-requests/{row.id}/status/",
            {"status": "WEIRD"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.post(
            f"/api/v1/community/problem-requests/{row.id}/status/",
            {"status": "FULFILLED", "problem_id": 999999},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.post(
            "/api/v1/community/problem-requests/999/status/", {"status": "DECLINED"}
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_anonymous_guards(self):
        response = self.client.post(
            "/api/v1/community/problem-requests/",
            {"title": "T", "description": "d"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        row = ProblemRequest.objects.create(
            requester=self.alice, title="T", description="d"
        )
        response = self.client.post(
            f"/api/v1/community/problem-requests/{row.id}/vote/"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        response = self.client.post("/api/v1/community/problem-requests/999/vote/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.client.force_authenticate(self.bob)
        response = self.client.post("/api/v1/community/problem-requests/999/vote/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
