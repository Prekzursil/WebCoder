"""COM-1 (competitive roadmap): the spoiler flag on problem-scoped posts
+ the problem-discussions list/create surface (?problem_id= was already
the forum's filter; this locks the spoiler contract)."""

from django.test import TestCase
from rest_framework.test import APIClient

from problems.models import Problem
from users.models import User


class SpoilerPostTest(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(username="author", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
            author=self.author,
        )
        self.user = User.objects.create_user(username="u", password="p")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _thread(self, problem=None):
        payload = {"title": "T", "content": "first"}
        if problem is not None:
            payload["problem"] = problem.id
        resp = self.client.post("/api/v1/forum/threads/", payload, format="json")
        assert resp.status_code == 201, resp.content
        return resp.json()["id"]

    def test_spoiler_allowed_in_problem_thread(self):
        tid = self._thread(self.problem)
        resp = self.client.post(
            f"/api/v1/forum/threads/{tid}/posts/",
            {"content": "the trick is a deque", "is_spoiler": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertTrue(resp.json()["is_spoiler"])

    def test_spoiler_rejected_in_global_thread(self):
        tid = self._thread()
        resp = self.client.post(
            f"/api/v1/forum/threads/{tid}/posts/",
            {"content": "spoiler?", "is_spoiler": True},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("is_spoiler", resp.json())

    def test_plain_post_defaults_not_spoiler(self):
        tid = self._thread(self.problem)
        resp = self.client.post(
            f"/api/v1/forum/threads/{tid}/posts/",
            {"content": "bump"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertFalse(resp.json()["is_spoiler"])

    def test_problem_thread_listing_by_problem_id(self):
        self._thread(self.problem)
        self._thread(self.problem)
        self._thread()
        resp = self.client.get(f"/api/v1/forum/threads/?problem_id={self.problem.id}")
        self.assertEqual(resp.status_code, 200)
        rows = resp.json()["results"]
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row["problem"] is not None for row in rows))
