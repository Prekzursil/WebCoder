"""JDG-3 (competitive roadmap): output-only problems.

The submitted answer text IS the candidate output — no compilation, no
execution, straight into the shared compare path. These tests run the
real celery task locally: the OUTPUT_ONLY pipeline touches no sandbox
service at all (the compile/run helpers are mocked to FAIL if called).
"""

from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from problems.models import Problem, TestCase as ProblemTestCase
from submissions.models import Submission, SubmissionTestResult
from submissions.tasks import judge_submission_task
from users.models import User

TASKS = "submissions.tasks"


def _call(submission_id):
    return judge_submission_task.run(submission_id)  # type: ignore[attr-defined]


class OutputOnlyJudgeTest(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="author", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "Translate"},
            statement_i18n={"en": "Write the answer."},
            problem_type=Problem.ProblemType.OUTPUT_ONLY,
            comparison_mode=Problem.ComparisonMode.EXACT,
            author=self.author,
        )
        self.tc = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="seed-1",
            expected_output_data="42",
            points=10,
            order=1,
        )

    def _sub(self, code):
        return Submission.objects.create(
            user=self.user, problem=self.problem, language="python3", code=code
        )

    def _assert_no_sandbox(self):
        def _boom(*args, **kwargs):  # pragma: no cover - failure path
            raise AssertionError("OUTPUT_ONLY must not touch the sandbox")

        return (
            mock.patch(f"{TASKS}.compile_code_in_sandbox", side_effect=_boom),
            mock.patch(f"{TASKS}.run_code_in_sandbox", side_effect=_boom),
        )

    def test_exact_answer_is_accepted(self):
        sub = self._sub("42")
        c, r = self._assert_no_sandbox()
        with c, r:
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(sub.score, 10)
        row = SubmissionTestResult.objects.get(submission=sub, test_case=self.tc)
        self.assertEqual(row.actual_output, "42")

    def test_wrong_answer_uses_the_shared_diff_path(self):
        sub = self._sub("41")
        c, r = self._assert_no_sandbox()
        with c, r:
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.WRONG_ANSWER)
        row = SubmissionTestResult.objects.get(submission=sub, test_case=self.tc)
        self.assertIn("differ", row.error_output.lower())

    def test_answer_compared_against_every_test(self):
        # One shared answer text, two tests with different expected
        # outputs: partial credit flows through the normal aggregator.
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="seed-2",
            expected_output_data="43",
            points=10,
            order=2,
        )
        sub = self._sub("42")
        c, r = self._assert_no_sandbox()
        with c, r:
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.WRONG_ANSWER)
        self.assertEqual(sub.score, 10)  # 10 of 20
        self.assertEqual(SubmissionTestResult.objects.filter(submission=sub).count(), 2)

    def test_lines_strip_mode_applies(self):
        self.problem.comparison_mode = Problem.ComparisonMode.LINES_STRIP_EXACT
        self.problem.save()
        sub = self._sub("  42  \n")
        c, r = self._assert_no_sandbox()
        with c, r:
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.ACCEPTED)


class OutputOnlyAuthoringTest(TestCase):
    """The authoring cross-field rule: OUTPUT_ONLY + interactor = 400."""

    def setUp(self):
        self.client = APIClient()
        self.author = User.objects.create_user(
            username="author", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        self.client.force_authenticate(self.author)

    def test_rejects_interactor_on_output_only(self):
        payload = {
            "title_i18n": {"en": "OO"},
            "statement_i18n": {"en": "S"},
            "problem_type": "OUTPUT_ONLY",
            "comparison_mode": "EXACT",
            "interactor_code": "int main() { return 0; }",
            "interactor_language": "cpp17",
            "allowed_languages": ["python3"],
        }
        resp = self.client.post("/api/v1/problems/problems/", payload, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("interactor", str(resp.json()))

    def test_output_only_problem_creates_cleanly(self):
        payload = {
            "title_i18n": {"en": "OO"},
            "statement_i18n": {"en": "S"},
            "problem_type": "OUTPUT_ONLY",
            "comparison_mode": "EXACT",
            "allowed_languages": ["python3"],
        }
        resp = self.client.post("/api/v1/problems/problems/", payload, format="json")
        self.assertEqual(resp.status_code, 201, resp.content)
