"""Wave E items 15/16/18 — verifier rejudge, testcase strength scoring,
language version pinning.

- item 15: the rejudge action admits VERIFIER (platform-wide), the
  problem's author and the submitter; a BASIC stranger is refused, and
  the in-flight 409 still holds;
- item 16: catch-rate scoring — a test's rate is the share of
  known-wrong solutions it fails; samples are listed but excluded from
  suite_strength; uncalibrated suites say so; the gate keeps the payload
  away from non-authors;
- item 18: every registry entry carries a toolchain descriptor and
  /api/v1/public/languages/ publishes it.
"""

from unittest import mock

from django.test import TestCase
from problems.models import Problem, TestCase as ProblemTestCase
from rest_framework.test import APIClient
from submissions.judge_utils.languages import LANGUAGES
from submissions.models import Submission, SubmissionTestResult
from users.models import User

AC = Submission.VerdictStatus.ACCEPTED
WA = Submission.VerdictStatus.WRONG_ANSWER
TLE = Submission.VerdictStatus.TIME_LIMIT_EXCEEDED
CE = Submission.VerdictStatus.COMPILE_ERROR


class VerifierRejudgeTest(TestCase):
    def setUp(self):
        self.submitter = User.objects.create_user(username="sub", password="p")
        self.author = User.objects.create_user(username="auth", password="p")
        self.verifier = User.objects.create_user(
            username="ver", password="p", role=User.Roles.PROBLEM_VERIFIER
        )
        self.stranger = User.objects.create_user(username="str", password="p")
        self.admin = User.objects.create_user(
            username="adm", password="p", is_staff=True
        )
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            author=self.author,
        )
        self.sub = Submission.objects.create(
            user=self.submitter,
            problem=self.problem,
            language="python3",
            code="x",
            verdict=WA,
        )

    def _rejudge(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.post(f"/api/v1/submissions/submissions/{self.sub.id}/rejudge/")

    def test_verifier_and_author_may_rejudge(self):
        with mock.patch("submissions.views.judge_task") as task:
            for user in (self.admin, self.verifier, self.author):
                self.sub.verdict = WA
                self.sub.save()
                response = self._rejudge(user)
                self.assertEqual(response.status_code, 200, user.username)
                self.sub.refresh_from_db()
                self.assertEqual(self.sub.verdict, Submission.VerdictStatus.PENDING)
        self.assertGreaterEqual(task.delay.call_count, 3)

    def test_submitter_and_stranger_refused(self):
        # Rejudge is a review action, not a re-roll: the submitter and a
        # BASIC stranger both stay out (the shipped discipline).
        for user in (self.submitter, self.stranger):
            self.sub.verdict = WA
            self.sub.save()
            response = self._rejudge(user)
            self.assertEqual(response.status_code, 403, user.username)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.verdict, WA)

    def test_unknown_submission_404(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        response = client.post("/api/v1/submissions/submissions/999999/rejudge/")
        self.assertEqual(response.status_code, 404)

    def test_in_flight_submission_conflict(self):
        self.sub.verdict = Submission.VerdictStatus.RUNNING
        self.sub.save()
        response = self._rejudge(self.verifier)
        self.assertEqual(response.status_code, 409)


class TestStrengthTest(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(username="a", password="p")
        self.verifier = User.objects.create_user(
            username="v", password="p", role=User.Roles.PROBLEM_VERIFIER
        )
        self.stranger = User.objects.create_user(username="s", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            author=self.author,
        )
        self.tc_sample = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="1",
            expected_output_data="1",
            is_sample=True,
            order=1,
        )
        self.tc_hidden = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="2",
            expected_output_data="2",
            order=2,
        )

    def _wrong_submission(self, sample_verdict=AC, hidden_verdict=AC):
        user = User.objects.create_user(
            username=f"w{User.objects.count()}", password="p"
        )
        sub = Submission.objects.create(
            user=user, problem=self.problem, language="python3", code="x", verdict=WA
        )
        SubmissionTestResult.objects.create(
            submission=sub, test_case=self.tc_sample, verdict=sample_verdict
        )
        SubmissionTestResult.objects.create(
            submission=sub, test_case=self.tc_hidden, verdict=hidden_verdict
        )
        return sub

    def _get(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.get(f"/api/v1/problems/{self.problem.id}/test-strength/")

    def test_uncalibrated_without_wrong_submissions(self):
        response = self._get(self.author)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["calibrated"])
        self.assertIsNone(response.data["suite_strength"])
        self.assertEqual(response.data["wrong_solutions"], 0)

    def test_catch_rates_and_suite_strength(self):
        # Two known-wrong solutions: both fail the hidden test; only one
        # fails the sample. CE submissions never ran — not counted.
        self._wrong_submission(sample_verdict=WA, hidden_verdict=WA)
        self._wrong_submission(sample_verdict=AC, hidden_verdict=TLE)
        Submission.objects.create(
            user=self.stranger,
            problem=self.problem,
            language="python3",
            code="x",
            verdict=CE,
        )
        response = self._get(self.verifier)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["calibrated"])
        self.assertEqual(response.data["wrong_solutions"], 2)
        by_id = {row["test_id"]: row for row in response.data["tests"]}
        self.assertEqual(by_id[self.tc_sample.id]["caught"], 1)
        self.assertEqual(by_id[self.tc_sample.id]["catch_rate"], 0.5)
        self.assertEqual(by_id[self.tc_hidden.id]["caught"], 2)
        self.assertEqual(by_id[self.tc_hidden.id]["catch_rate"], 1.0)
        # suite_strength excludes the sample test: 1.0, not 0.75.
        self.assertEqual(response.data["suite_strength"], 1.0)

    def test_gate_hides_from_strangers_and_unknown_problems(self):
        self.assertEqual(self._get(self.stranger).status_code, 404)
        client = APIClient()
        client.force_authenticate(self.author)
        self.assertEqual(
            client.get("/api/v1/problems/999999/test-strength/").status_code, 404
        )


class ToolchainPinningTest(TestCase):
    """Item 18: every registry entry publishes its pinned toolchain."""

    def test_every_language_carries_a_toolchain_descriptor(self):
        self.assertGreaterEqual(len(LANGUAGES), 15)
        for spec in LANGUAGES.values():
            self.assertTrue(
                spec.toolchain, f"{spec.language_id} has no toolchain descriptor"
            )

    def test_public_api_publishes_toolchain(self):
        client = APIClient()
        response = client.get("/api/v1/public/languages/")
        self.assertEqual(response.status_code, 200)
        rows = {row["id"]: row for row in response.data["results"]}
        self.assertEqual(rows["python3"]["toolchain"], "CPython 3.11")
        self.assertIn("OpenJDK 21", rows["java11"]["toolchain"])
        self.assertIn("2.0.21", rows["kotlin"]["toolchain"])
