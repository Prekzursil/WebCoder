"""Pagination contract tests (SPEC-GAPS D-B4).

Every router-registered list endpoint must paginate:
- page-number endpoints return {count, next, previous, results};
- submissions (newest-first feed) return the cursor shape {next, previous,
  results} and honor ?cursor=;
- ?page_size is clamped at 100; ?page=9999 -> 404;
- the submissions LIST payload is slim (no code / test_results).
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from problems.models import Problem
from submissions.models import Submission
from users.models import User


def _problem(n, status_=Problem.ProblemStatus.APPROVED):
    return Problem.objects.create(
        title_i18n={"en": f"P{n}"},
        statement_i18n={"en": "S"},
        status=status_,
    )


class PaginationShapeTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="pager", password="p")
        for i in range(25):  # > default page_size of 20
            _problem(i)

    def test_problems_list_returns_wrapped_shape(self):
        resp = self.client.get("/api/v1/problems/problems/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertIn("count", body)
        self.assertIn("next", body)
        self.assertIn("previous", body)
        self.assertEqual(len(body["results"]), 20)
        self.assertEqual(body["count"], 25)

    def test_page_size_clamped_to_max(self):
        resp = self.client.get("/api/v1/problems/problems/?page_size=1000")
        body = resp.json()
        self.assertLessEqual(len(body["results"]), 100)

    def test_out_of_range_page_404(self):
        resp = self.client.get("/api/v1/problems/problems/?page=9999")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_page_two_follows_next_link(self):
        resp = self.client.get("/api/v1/problems/problems/")
        body = resp.json()
        self.assertIsNotNone(body["next"])
        resp2 = self.client.get("/api/v1/problems/problems/?page=2")
        self.assertEqual(len(resp2.json()["results"]), 5)

    def test_anonymous_problem_list_still_200(self):
        resp = self.client.get("/api/v1/problems/problems/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_users_list_paginated(self):
        for i in range(22):
            User.objects.create_user(username=f"u{i}", password="p")
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/v1/users/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertIn("count", body)
        self.assertLessEqual(len(body["results"]), 20)

    def test_admin_manage_list_paginated(self):
        admin = User.objects.create_user(
            username="adminp", password="p", is_staff=True, role=User.Roles.ADMIN
        )
        self.client.force_authenticate(admin)
        resp = self.client.get("/api/v1/users/admin/manage/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("count", resp.json())


class SubmissionCursorPaginationTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="subp", password="p")
        self.problem = _problem(0)
        for i in range(30):  # > cursor page_size of 25
            Submission.objects.create(
                user=self.user,
                problem=self.problem,
                language="python3",
                code=f"print({i})",
            )

    def test_submissions_list_returns_cursor_shape(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/v1/submissions/submissions/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertNotIn("count", body)  # cursor shape
        self.assertIn("next", body)
        self.assertIn("results", body)
        self.assertEqual(len(body["results"]), 25)

    def test_cursor_follows_next_page(self):
        self.client.force_authenticate(self.user)
        first = self.client.get("/api/v1/submissions/submissions/").json()
        ids_first = {row["id"] for row in first["results"]}
        self.client.credentials()  # reset then re-auth
        self.client.force_authenticate(self.user)
        second = self.client.get(first["next"]).json()
        ids_second = {row["id"] for row in second["results"]}
        self.assertEqual(len(ids_second), 5)
        self.assertFalse(ids_first & ids_second)  # no overlap across pages

    def test_list_payload_is_slim(self):
        self.client.force_authenticate(self.user)
        body = self.client.get("/api/v1/submissions/submissions/").json()
        for row in body["results"]:
            self.assertNotIn("code", row)
            self.assertNotIn("test_results", row)

    def test_retrieve_keeps_full_shape(self):
        sub = Submission.objects.first()
        self.client.force_authenticate(self.user)
        body = self.client.get(f"/api/v1/submissions/submissions/{sub.id}/").json()
        self.assertIn("code", body)
        self.assertIn("test_results", body)
