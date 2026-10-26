"""Wave A judge-package tests (competitive roadmap J5/J6/J7/J8/RO-4/X7):
per-language limits, scoring modes + cached full_score, checker protocol v2
(compile-once + partial POINTS), token/case-insensitive comparison with diff
hints, file-I/O mode, and the scratch endpoint.
"""

from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from problems.models import Problem, TestCase as ProblemTestCase
from problems.scoring import aggregate_score, full_score_for
from scratch.models import ScratchRun
from submissions.judge_utils.comparison import compare_outputs_detailed
from submissions.judge_utils.languages import effective_limits, get_language
from submissions.models import Submission, SubmissionTestResult
from submissions.tasks import judge_submission_task
from users.models import User

TASKS = "submissions.tasks"
SCRATCH = "scratch.views"

CM = Problem.ComparisonMode


def _call(submission_id):
    return judge_submission_task.run(submission_id)  # type: ignore[attr-defined]


class EffectiveLimitsTest(TestCase):
    """J5: registry multipliers, memory floors, explicit overrides."""

    def test_python_gets_3x_time(self):
        time_ms, _mem = effective_limits(1000, 262144, "python3")
        self.assertEqual(time_ms, 3000)

    def test_java_gets_2x_time_and_512mb_floor(self):
        time_ms, mem_kb = effective_limits(1000, 262144, "java11")
        self.assertEqual(time_ms, 2000)
        self.assertEqual(mem_kb, 524288)

    def test_cpp_unadjusted(self):
        time_ms, mem_kb = effective_limits(1000, 262144, "cpp17")
        self.assertEqual((time_ms, mem_kb), (1000, 262144))

    def test_explicit_override_beats_multiplier(self):
        time_ms, mem_kb = effective_limits(
            1000,
            262144,
            "python3",
            {"python3": {"time_ms": 1500, "memory_kb": 131072}},
        )
        self.assertEqual((time_ms, mem_kb), (1500, 131072))

    def test_partial_override_keeps_other_axis_default(self):
        time_ms, mem_kb = effective_limits(
            1000, 262144, "python3", {"python3": {"time_ms": 1200}}
        )
        self.assertEqual(time_ms, 1200)
        self.assertEqual(mem_kb, 262144)

    def test_unknown_language_defaults_to_identity(self):
        self.assertEqual(effective_limits(500, 1000, "cobol"), (500, 1000))


class ComparisonDetailedTest(TestCase):
    """J8: TOKEN mode, case-insensitivity, first-mismatch hints."""

    def test_token_mode_ignores_inner_whitespace(self):
        ok, hint = compare_outputs_detailed("1  2\t3\n", "1 2 3\n", CM.TOKEN)
        self.assertTrue(ok)
        self.assertIsNone(hint)

    def test_token_mode_detects_mismatch_with_line_hint(self):
        ok, hint = compare_outputs_detailed("1 2\n3 9\n", "1 2\n3 4\n", CM.TOKEN)
        self.assertFalse(ok)
        self.assertIn("line 2", hint)

    def test_case_insensitive_exact(self):
        ok, _ = compare_outputs_detailed("Da\n", "DA\n", CM.EXACT, case_insensitive=True)
        self.assertTrue(ok)
        ok, _ = compare_outputs_detailed("Da\n", "DA\n", CM.EXACT)
        self.assertFalse(ok)

    def test_lines_strip_gives_line_hint(self):
        ok, hint = compare_outputs_detailed("a\nb\n", "a\nc\n", CM.LINES_STRIP_EXACT)
        self.assertFalse(ok)
        self.assertIn("line 2", hint)

    def test_line_count_hint(self):
        ok, hint = compare_outputs_detailed("1\n2\n", "1\n", CM.LINES_STRIP_EXACT)
        self.assertFalse(ok)
        self.assertIn("expected 1 line(s), got 2", hint)

    def test_unknown_mode_falls_back_to_lines_strip(self):
        ok, _ = compare_outputs_detailed("1 \n2\n", "1\n2", "WEIRD")
        self.assertTrue(ok)


class ScoringAggregationTest(TestCase):
    """J6: full_score computation + per-mode aggregation."""

    def setUp(self):
        self.author = User.objects.create_user(username="author", password="pw")

    def _problem(self, **kw):
        defaults = dict(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            author=self.author,
        )
        defaults.update(kw)
        return Problem.objects.create(**defaults)

    def _tc(self, problem, points, subtask="", order=0):
        return ProblemTestCase.objects.create(
            problem=problem,
            input_data="in",
            expected_output_data="out",
            points=points,
            subtask=subtask,
            order=order,
        )

    def test_full_score_signal_caches_total(self):
        problem = self._problem()
        self._tc(problem, 10, order=0)
        self._tc(problem, 20, order=1)
        self._tc(problem, 20, subtask="s1", order=2)
        self._tc(problem, 20, subtask="s1", order=3)
        problem.refresh_from_db()
        # 10 + 20 (ungrouped) + 20 (subtask s1 counted once)
        self.assertEqual(problem.full_score, 50)

    def test_subtask_aggregation_all_or_nothing(self):
        problem = self._problem(scoring_mode=Problem.ScoringMode.SUBTASKS)
        t1 = self._tc(problem, 30, subtask="s1", order=0)
        t2 = self._tc(problem, 30, subtask="s1", order=1)
        lone = self._tc(problem, 10, order=2)
        # one member fails → whole group scores 0; lone passes
        score, full = aggregate_score(
            problem.scoring_mode, [(t1, True), (t2, False), (lone, True)]
        )
        self.assertEqual((score, full), (10, 40))
        # whole group passes → 40
        score, full = aggregate_score(
            problem.scoring_mode, [(t1, True), (t2, True), (lone, True)]
        )
        self.assertEqual((score, full), (40, 40))

    def test_binary_aggregation(self):
        problem = self._problem(scoring_mode=Problem.ScoringMode.BINARY)
        t1 = self._tc(problem, 10, order=0)
        t2 = self._tc(problem, 10, order=1)
        score, full = aggregate_score(problem.scoring_mode, [(t1, True), (t2, False)])
        self.assertEqual((score, full), (0, 20))
        score, _ = aggregate_score(problem.scoring_mode, [(t1, True), (t2, True)])
        self.assertEqual(score, 20)

    def test_partial_per_test_unchanged(self):
        problem = self._problem()
        t1 = self._tc(problem, 10, order=0)
        t2 = self._tc(problem, 10, order=1)
        score, full = aggregate_score(problem.scoring_mode, [(t1, True), (t2, False)])
        self.assertEqual((score, full), (10, 20))


class JudgeTaskWaveATest(TestCase):
    """End-to-end (sandbox mocked) task behavior for the new features."""

    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            comparison_mode=CM.EXACT,
        )
        self.tc = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="in",
            expected_output_data="out",
            points=10,
            order=1,
        )

    def _sub(self, code="print(1)", language="python3"):
        return Submission.objects.create(
            user=self.user, problem=self.problem, language=language, code=code
        )

    def test_effective_limits_passed_to_sandbox(self):
        sub = self._sub(language="python3")
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(
                    Submission.VerdictStatus.ACCEPTED,
                    10,
                    1024,
                    "out",
                    "",
                ),
            ) as run_mock,
        ):
            _call(sub.id)
        self.assertEqual(run_mock.call_args.kwargs.get("io_files"), None)
        # python3 multiplier: 1000ms default → 3000ms effective
        self.assertEqual(run_mock.call_args.args[3], 3000)

    def test_files_mode_writes_input_and_reads_output_file(self):
        self.problem.io_mode = Problem.IOMode.FILES
        self.problem.io_input_filename = "b210.in"
        self.problem.io_output_filename = "b210.out"
        self.problem.save()
        self.tc.expected_output_data = "file-out"
        self.tc.save()
        sub = self._sub()
        captured = {}

        def fake_run(exe, lang, input_data, t, m, submission_dir, libs, io_files=None):
            captured["io_files"] = io_files
            in_path = submission_dir / io_files[0]
            captured["input_written"] = in_path.read_text()
            # The real execution.py reads the output file back and returns
            # it as the run's output — the mock simulates that readback.
            (submission_dir / io_files[1]).write_text("file-out")
            return (
                Submission.VerdictStatus.ACCEPTED,
                10,
                1024,
                "file-out",
                "",
            )

        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(f"{TASKS}.run_code_in_sandbox", side_effect=fake_run),
        ):
            _call(sub.id)
        self.assertEqual(captured["io_files"], ("b210.in", "b210.out"))
        self.assertEqual(captured["input_written"], "in")
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.ACCEPTED)

    def test_wa_records_diff_hint(self):
        sub = self._sub()
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 10, 1024, "wrong", ""),
            ),
        ):
            _call(sub.id)
        result = SubmissionTestResult.objects.get(submission=sub)
        self.assertEqual(result.verdict, Submission.VerdictStatus.WRONG_ANSWER)
        self.assertIn("outputs differ", result.error_output)

    def test_submission_serializer_exposes_max_score(self):
        from submissions.serializers import SubmissionSerializer

        sub = self._sub()
        sub.verdict = Submission.VerdictStatus.ACCEPTED
        sub.score = 10
        sub.save()
        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get(f"/api/v1/submissions/submissions/{sub.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["max_score"], 10)  # one 10-point test
        self.assertEqual(response.data["score"], 10)


class ScratchEndpointTest(TestCase):
    """X7: custom invocation endpoint (sandbox mocked)."""

    def setUp(self):
        self.user = User.objects.create_user(username="su", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.payload = {"language": "python3", "code": "print(input())", "input": "42"}

    def test_anonymous_forbidden(self):
        anon = APIClient()
        response = anon.post("/api/v1/scratch/", self.payload)
        self.assertEqual(response.status_code, 401)

    def test_unknown_language_rejected(self):
        response = self.client.post(
            "/api/v1/scratch/", {"language": "cobol", "code": "x", "input": ""}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsupported language", str(response.data))

    def test_happy_path_persists_audit_row(self):
        with (
            mock.patch(
                f"{SCRATCH}.compile_code_in_sandbox",
                return_value=(True, "", "/tmp/exe"),
            ),
            mock.patch(
                f"{SCRATCH}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 12, 2048, "42\n", ""),
            ),
        ):
            response = self.client.post("/api/v1/scratch/", self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "OK")
        self.assertEqual(response.data["output"], "42\n")
        run = ScratchRun.objects.get(id=response.data["id"])
        self.assertEqual(run.user, self.user)
        self.assertEqual(run.stdout_data, "42\n")

    def test_compile_error_short_circuits(self):
        with mock.patch(
            f"{SCRATCH}.compile_code_in_sandbox",
            return_value=(False, "SyntaxError: invalid syntax", None),
        ):
            response = self.client.post("/api/v1/scratch/", self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "COMPILE_ERROR")
        self.assertIn("SyntaxError", response.data["error"])

    def test_timeout_and_runtime_error_mapping(self):
        for verdict, expected in [
            (Submission.VerdictStatus.TIME_LIMIT_EXCEEDED, "TIMEOUT"),
            (Submission.VerdictStatus.RUNTIME_ERROR, "RUNTIME_ERROR"),
        ]:
            with (
                mock.patch(
                    f"{SCRATCH}.compile_code_in_sandbox",
                    return_value=(True, "", "/tmp/exe"),
                ),
                mock.patch(
                    f"{SCRATCH}.run_code_in_sandbox",
                    return_value=(verdict, -1, -1, "", "boom"),
                ),
            ):
                response = self.client.post("/api/v1/scratch/", self.payload)
            self.assertEqual(response.data["status"], expected)

    def test_output_truncated_at_cap(self):
        big = "x" * 50_000
        with (
            mock.patch(
                f"{SCRATCH}.compile_code_in_sandbox",
                return_value=(True, "", "/tmp/exe"),
            ),
            mock.patch(
                f"{SCRATCH}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 512, big, ""),
            ),
        ):
            response = self.client.post("/api/v1/scratch/", self.payload)
        self.assertEqual(len(response.data["output"]), 10_000)

    def test_scoped_throttle_blocks_burst(self):
        # Same discipline as users/test_throttling.py: patch the
        # import-time-bound THROTTLE_RATES class attribute and isolate via
        # a unique REMOTE_ADDR (the throttle cache key).
        from rest_framework.throttling import SimpleRateThrottle

        # ScopedRateThrottle keys on the authenticated user id, so a fresh
        # user isolates this test's throttle window from its siblings.
        isolated = User.objects.create_user(username="throttle-user", password="pw")
        self.client.force_authenticate(user=isolated)
        with mock.patch.object(
            SimpleRateThrottle,
            "THROTTLE_RATES",
            {"anon": "10000/min", "user": "10000/min", "scratch": "2/min"},
        ):
            with (
                mock.patch(
                    f"{SCRATCH}.compile_code_in_sandbox",
                    return_value=(True, "", "/tmp/exe"),
                ),
                mock.patch(
                    f"{SCRATCH}.run_code_in_sandbox",
                    return_value=(Submission.VerdictStatus.ACCEPTED, 1, 1, "ok", ""),
                ),
            ):
                first = self.client.post(
                    "/api/v1/scratch/", self.payload, REMOTE_ADDR="10.7.0.9"
                )
                second = self.client.post(
                    "/api/v1/scratch/", self.payload, REMOTE_ADDR="10.7.0.9"
                )
                third = self.client.post(
                    "/api/v1/scratch/", self.payload, REMOTE_ADDR="10.7.0.9"
                )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)


class ScratchModelTest(TestCase):
    def test_str_representation(self):
        user = User.objects.create_user(username="sm", password="pw")
        run = ScratchRun.objects.create(
            user=user, language="python3", source_code="print(1)"
        )
        self.assertIn("python3", str(run))


class CheckerProtocolV2TaskTest(TestCase):
    """J7 through the judge task: compile-once + partial-point scoring."""

    def setUp(self):
        self.user = User.objects.create_user(username="cu", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "CP2"},
            statement_i18n={"en": "S"},
            comparison_mode=CM.CUSTOM_CHECKER,
            checker_code="print('POINTS 0.5')",
            checker_language="python3",
        )
        for i in range(3):
            ProblemTestCase.objects.create(
                problem=self.problem,
                input_data=f"in{i}",
                expected_output_data="out",
                points=10,
                order=i,
            )

    def _sub(self):
        return Submission.objects.create(
            user=self.user, problem=self.problem, language="python3", code="print(1)"
        )

    def _checker_run(self, fraction=0.5):
        """(compile_mock, run_mock) with a scripted checker verdict."""
        from submissions.judge_utils import checkers as checkers_mod

        compile_mock = mock.patch(
            f"{TASKS}.compile_checker",
            return_value=(True, "ready", checkers_mod.get_language("python3")),
        )
        run_mock = mock.patch(
            f"{TASKS}.run_prepared_checker",
            return_value=(
                Submission.VerdictStatus.ACCEPTED,
                fraction,
                f"Checker awarded {fraction:.0%}",
            ),
        )
        return compile_mock, run_mock

    def test_checker_compiles_once_across_tests(self):
        sub = self._sub()
        compile_mock, run_mock = self._checker_run()
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 512, "out", ""),
            ),
            compile_mock as c,
            run_mock as r,
        ):
            _call(sub.id)
        self.assertEqual(c.call_count, 1)  # compiled ONCE, not per test
        self.assertEqual(r.call_count, 3)  # executed per test

    def test_partial_fraction_scales_partial_per_test_score(self):
        sub = self._sub()
        compile_mock, run_mock = self._checker_run(fraction=0.5)
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 512, "out", ""),
            ),
            compile_mock,
            run_mock,
        ):
            _call(sub.id)
        sub.refresh_from_db()
        # 3 tests x 10 points x 0.5 = 15 of 30; verdict stays AC (J6 UI
        # renders the PARTIAL state from score < max_score).
        self.assertEqual(sub.verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(sub.score, 15)

    def test_checker_compile_failure_fails_submission_fast(self):
        sub = self._sub()
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.compile_checker",
                return_value=(False, "Checker compile failed.\nsyntax", None),
            ),
        ):
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.INTERNAL_ERROR)
        self.assertIn("syntax", sub.detailed_feedback)
        # No test rows were produced — the failure precedes the loop.
        self.assertEqual(
            SubmissionTestResult.objects.filter(submission=sub).count(), 0
        )

    def test_missing_checker_code_yields_per_test_ie(self):
        self.problem.checker_code = ""
        self.problem.save()
        sub = self._sub()
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 512, "out", ""),
            ),
            mock.patch(f"{TASKS}.compile_checker") as c,
        ):
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.INTERNAL_ERROR)
        c.assert_not_called()  # nothing to compile without checker source
        self.assertEqual(
            SubmissionTestResult.objects.filter(submission=sub).count(), 3
        )


class AggregateScoreFractionTest(TestCase):
    """J7 fractions through aggregate_score (all three modes)."""

    def setUp(self):
        self.problem = Problem.objects.create(
            title_i18n={"en": "F"},
            statement_i18n={"en": "S"},
        )
        self.t1 = ProblemTestCase.objects.create(
            problem=self.problem, input_data="a", expected_output_data="b",
            points=10, order=0,
        )
        self.t2 = ProblemTestCase.objects.create(
            problem=self.problem, input_data="a", expected_output_data="b",
            points=10, order=1,
        )

    def test_partial_credit_sums_fractions(self):
        score, full = aggregate_score(
            self.problem.scoring_mode,
            [(self.t1, True, 0.5), (self.t2, True)],
        )
        self.assertEqual((score, full), (15, 20))

    def test_failed_test_ignores_fraction(self):
        score, _ = aggregate_score(
            self.problem.scoring_mode,
            [(self.t1, False, 0.9), (self.t2, True)],
        )
        self.assertEqual(score, 10)

    def test_binary_requires_full_credit_each_test(self):
        self.problem.scoring_mode = Problem.ScoringMode.BINARY
        self.problem.save()
        score, full = aggregate_score(
            Problem.ScoringMode.BINARY, [(self.t1, True, 0.5), (self.t2, True)]
        )
        self.assertEqual((score, full), (0, 20))
        score, _ = aggregate_score(
            Problem.ScoringMode.BINARY, [(self.t1, True, 1.0), (self.t2, True)]
        )
        self.assertEqual(score, 20)

    def test_subtasks_group_needs_full_credit_members(self):
        self.problem.scoring_mode = Problem.ScoringMode.SUBTASKS
        self.problem.save()
        self.t1.subtask = "g1"
        self.t1.save()
        self.t2.subtask = "g1"
        self.t2.save()
        score, full = aggregate_score(
            Problem.ScoringMode.SUBTASKS,
            [(self.t1, True, 0.5), (self.t2, True)],
        )
        self.assertEqual((score, full), (0, 10))
        score, _ = aggregate_score(
            Problem.ScoringMode.SUBTASKS,
            [(self.t1, True, 1.0), (self.t2, True)],
        )
        self.assertEqual(score, 10)
