"""Wave E items 6/7/19/21/25 — per-test time bars, WA diff data, memory
profile bars, "Am I close?" bands and TLE time-travel evidence.

Covers:
- the judge loop resolves ``TestCase.time_limit_ms`` over the effective
  limit and persists the applied bar on every ``SubmissionTestResult``;
- the per-test serializer strips hidden-test outputs for regular viewers
  and exposes sample input/expected pairs for the diff viewer (the J10
  remnant, closed with item 7);
- ``SubmissionSerializer.closeness`` bands.
"""

from unittest import mock

from django.test import TestCase
from problems.models import Problem, TestCase as ProblemTestCase
from submissions.models import Submission, SubmissionTestResult
from submissions.serializers import (
    SubmissionSerializer,
    SubmissionTestResultSerializer,
)
from submissions.tasks import judge_submission_task
from users.models import User

TASKS = "submissions.tasks"

AC = Submission.VerdictStatus.ACCEPTED
WA = Submission.VerdictStatus.WRONG_ANSWER


def _call(submission_id):
    return judge_submission_task.run(submission_id)  # type: ignore[attr-defined]


class PerTestLimitTest(TestCase):
    """Item 6: the per-test override is the bar that run; items 19/25: the
    applied bar is persisted on the row."""

    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            comparison_mode=Problem.ComparisonMode.EXACT,
            default_time_limit_ms=1000,
            full_score=20,
        )
        self.tc_plain = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="1",
            expected_output_data="1",
            points=10,
            order=1,
        )
        self.tc_bar = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="2",
            expected_output_data="2",
            points=10,
            order=2,
            time_limit_ms=4000,
        )

    def _sub(self):
        return Submission.objects.create(
            user=self.user, problem=self.problem, language="python3", code="print(1)"
        )

    def test_override_beats_effective_limit_and_is_persisted(self):
        sub = self._sub()
        seen_limits: list[int] = []

        def fake_run(executable, language, stdin, time_ms, mem_kb, *a, **kw):
            seen_limits.append(time_ms)
            return (AC, 10, 1000, stdin, "")

        with mock.patch(f"{TASKS}.run_code_in_sandbox", side_effect=fake_run), mock.patch(
            f"{TASKS}.compile_code_in_sandbox",
            return_value=(True, "", "/tmp/x"),
        ):
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, AC)
        # python3's registry multiplier inflates 1000 -> 3000 for the plain
        # test; the explicit 4000 bar wins untouched for the second.
        self.assertIn(3000, seen_limits)
        self.assertIn(4000, seen_limits)
        rows = {r.test_case_id: r for r in sub.test_results.all()}
        self.assertEqual(rows[self.tc_plain.id].limit_time_ms, 3000)
        self.assertEqual(rows[self.tc_bar.id].limit_time_ms, 4000)
        self.assertIsNotNone(rows[self.tc_plain.id].limit_memory_kb)

    def test_output_only_rows_still_record_the_resolved_bar(self):
        self.problem.problem_type = Problem.ProblemType.OUTPUT_ONLY
        self.problem.save()
        sub = Submission.objects.create(
            user=self.user, problem=self.problem, language="python3", code="1"
        )
        with mock.patch(f"{TASKS}.compile_code_in_sandbox") as compile_mock:
            _call(sub.id)
        compile_mock.assert_not_called()
        row = sub.test_results.get(test_case=self.tc_plain)
        self.assertEqual(row.limit_time_ms, 3000)
        self.assertEqual(row.verdict, AC)

    def test_interactive_pair_receives_the_per_test_bar(self):
        self.problem.problem_type = Problem.ProblemType.INTERACTIVE
        self.problem.interactor_code = "print('ok')"
        self.problem.interactor_language = "python3"
        self.problem.save()
        sub = self._sub()
        with mock.patch(
            f"{TASKS}.compile_code_in_sandbox", return_value=(True, "", "/tmp/x")
        ), mock.patch(
            f"{TASKS}.compile_interactor",
            return_value=(True, "", object()),
        ) as compile_i, mock.patch(
            f"{TASKS}.run_interactive_pair",
            return_value=(AC, 5, 512, None, ""),
        ) as run_pair:
            _call(sub.id)
        compile_i.assert_called_once()
        # Two tests -> two pair runs, one per resolved bar.
        self.assertEqual(run_pair.call_count, 2)
        bars = [c.args[5] for c in run_pair.call_args_list]
        self.assertEqual(bars, [3000, 4000])
        row = sub.test_results.get(test_case=self.tc_bar)
        self.assertEqual(row.limit_time_ms, 4000)


class TestResultVisibilityTest(TestCase):
    """Item 7 (+ the J10 remnant): hidden rows leak nothing; sample rows
    carry the diff pair; authors/staff keep full detail."""

    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="p")
        self.other = User.objects.create_user(username="other", password="p")
        self.verifier = User.objects.create_user(
            username="ver", password="p", role=User.Roles.PROBLEM_VERIFIER
        )
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            author=self.owner,
        )
        self.tc_sample = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="sample-in",
            expected_output_data="sample-out",
            is_sample=True,
            order=1,
        )
        self.tc_hidden = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="hidden-in",
            expected_output_data="hidden-out",
            order=2,
        )
        self.sub = Submission.objects.create(
            user=self.owner, problem=self.problem, language="python3", code="x"
        )

    def _row(self, tc):
        # One row per (submission, test_case) — cache so repeated calls in
        # a single test reuse the same row instead of violating the unique
        # constraint.
        existing = SubmissionTestResult.objects.filter(
            submission=self.sub, test_case=tc
        ).first()
        if existing is not None:
            return existing
        return SubmissionTestResult.objects.create(
            submission=self.sub,
            test_case=tc,
            verdict=WA,
            actual_output="captured",
            error_output="stderr",
            limit_time_ms=1000,
            limit_memory_kb=262144,
        )

    def _serialize(self, row, user):
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/")
        request.user = user
        return SubmissionTestResultSerializer(row, context={"request": request}).data

    def test_hidden_row_stripped_for_stranger(self):
        data = self._serialize(self._row(self.tc_hidden), self.other)
        self.assertIsNone(data["actual_output"])
        self.assertIsNone(data["error_output"])
        self.assertNotIn("input_data", data["test_case_details"])
        # Verdict/timing/memory/limits stay — "which test failed" is useful.
        self.assertEqual(data["verdict"], WA)
        self.assertEqual(data["limit_time_ms"], 1000)
        self.assertEqual(data["limit_memory_kb"], 262144)

    def test_hidden_row_visible_to_author_verifier_and_anonymous_limits(self):
        for viewer in (self.owner, self.verifier):
            data = self._serialize(self._row(self.tc_hidden), viewer)
            self.assertEqual(data["actual_output"], "captured")
            self.assertEqual(
                data["test_case_details"]["input_data"], "hidden-in"
            )
        # Anonymous (no request in context) sees the stripped shape too.
        data = SubmissionTestResultSerializer(self._row(self.tc_hidden)).data
        self.assertIsNone(data["actual_output"])

    def test_hidden_row_visible_to_staff(self):
        staff = User.objects.create_user(
            username="staff", password="p", is_staff=True
        )
        data = self._serialize(self._row(self.tc_hidden), staff)
        self.assertEqual(data["actual_output"], "captured")
        self.assertEqual(data["test_case_details"]["input_data"], "hidden-in")

    def test_hidden_row_stripped_for_authenticated_non_privileged_roles(self):
        # A TEACHER (authenticated, role set, but neither ADMIN nor VERIFIER
        # nor the author) still gets the stripped hidden row.
        teacher = User.objects.create_user(
            username="teach", password="p", role=User.Roles.TEACHER
        )
        data = self._serialize(self._row(self.tc_hidden), teacher)
        self.assertIsNone(data["actual_output"])
        self.assertIsNone(data["error_output"])

    def test_sample_row_carries_diff_pair_for_everyone(self):
        data = self._serialize(self._row(self.tc_sample), self.other)
        self.assertEqual(data["actual_output"], "captured")
        self.assertEqual(data["test_case_details"]["input_data"], "sample-in")
        self.assertEqual(
            data["test_case_details"]["expected_output_data"], "sample-out"
        )

    def test_missing_problem_fk_is_not_privileged(self):
        # A broken submission pointer (defensive path) must read as
        # non-privileged — the ObjectDoesNotExist guard inside _privileged.
        row = self._row(self.tc_hidden)
        row.submission_id = None
        serializer = SubmissionTestResultSerializer(
            row, context={"request": mock.Mock(user=self.owner)}
        )
        self.assertFalse(serializer._privileged(row))
        data = serializer.data
        self.assertIsNone(data["actual_output"])
        self.assertNotIn("input_data", data["test_case_details"])


class ClosenessBandsTest(TestCase):
    """Item 21: band + ratio derived from score / full_score."""

    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"}, statement_i18n={"en": "S"}, full_score=100
        )

    def _sub(self, score):
        return Submission.objects.create(
            user=self.user,
            problem=self.problem,
            language="python3",
            code="x",
            score=score,
            verdict=WA,
        )

    def _band(self, score):
        return SubmissionSerializer(self._sub(score)).data["closeness"]

    def test_bands(self):
        self.assertEqual(self._band(100)["band"], "SOLVED")
        self.assertEqual(self._band(80)["band"], "SO_CLOSE")
        self.assertEqual(self._band(75)["band"], "SO_CLOSE")
        self.assertEqual(self._band(60)["band"], "HALFWAY")
        self.assertEqual(self._band(10)["band"], "STARTED")
        self.assertEqual(self._band(0)["band"], "NONE")
        # ratio is carried alongside for UI progress bars
        self.assertEqual(self._band(80)["ratio"], 0.8)

    def test_unscored_and_pointless_problems_are_none(self):
        self.assertIsNone(self._band(None))
        pointless = Problem.objects.create(
            title_i18n={"en": "Q"}, statement_i18n={"en": "S"}, full_score=0
        )
        sub = Submission.objects.create(
            user=self.user, problem=pointless, language="python3", code="x", score=5
        )
        self.assertIsNone(SubmissionSerializer(sub).data["closeness"])


class TestCaseBarExposedTest(TestCase):
    """Item 6: the authoring API round-trips the per-test bar."""

    def test_test_case_serializer_carries_bar(self):
        from problems.models import Problem, TestCase as ProblemTestCase
        from problems.serializers import TestCaseSerializer
        from rest_framework.test import APIRequestFactory

        problem = Problem.objects.create(
            title_i18n={"en": "P"}, statement_i18n={"en": "S"}
        )
        tc = ProblemTestCase.objects.create(
            problem=problem,
            input_data="i",
            expected_output_data="o",
            time_limit_ms=2500,
        )
        factory = APIRequestFactory()
        request = factory.get("/")
        request.user = User.objects.create_user(username="a", password="p")
        data = TestCaseSerializer(tc, context={"request": request}).data
        self.assertEqual(data["time_limit_ms"], 2500)
