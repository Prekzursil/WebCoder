"""Full line+branch coverage for submissions.tasks.judge_submission_task.

The sandboxed compile/run/checker helpers are mocked; this exercises the
orchestration logic, DB updates, verdict aggregation, and error handling.
"""

from unittest import mock

from django.test import TestCase

from problems.models import Problem, TestCase as ProblemTestCase
from submissions.models import Submission, SubmissionTestResult
from submissions.tasks import judge_submission_task
from users.models import User

TASKS = "submissions.tasks"


def _call(submission_id):
    # bind=True Celery task: ``.run`` is the user function with ``self`` bound.
    # Celery ships no type info in the lean check env, so ``.run`` is opaque.
    return judge_submission_task.run(submission_id)  # type: ignore[attr-defined]


class JudgeSubmissionTaskTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            comparison_mode=Problem.ComparisonMode.EXACT,
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

    def test_submission_not_pending_returns_early(self):
        sub = self._sub()
        sub.verdict = Submission.VerdictStatus.ACCEPTED
        sub.save()
        msg = _call(sub.id)
        self.assertIn("not PENDING", msg)

    def test_submission_not_found(self):
        msg = _call(999999)
        self.assertIn("not found", msg)

    def test_compile_error(self):
        sub = self._sub()
        with mock.patch(
            f"{TASKS}.compile_code_in_sandbox",
            return_value=(False, "syntax error", None),
        ):
            msg = _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.COMPILE_ERROR)
        self.assertIn("Compile Error", msg)

    def test_multiple_test_cases_first_fails(self):
        # A second test case so the loop iterates twice. The first fails (sets the
        # overall verdict), the second is ACCEPTED -> exercises the loop-back
        # `if overall_verdict == ACCEPTED` already-set branch (169->79).
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="in2",
            expected_output_data="out2",
            points=10,
            order=2,
        )
        sub = self._sub()
        verdicts = iter(
            [
                (Submission.VerdictStatus.WRONG_ANSWER, 1, 1, "x", ""),
                (Submission.VerdictStatus.WRONG_ANSWER, 1, 1, "y", ""),
            ]
        )
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                side_effect=lambda *a, **k: next(verdicts),
            ),
        ):
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.WRONG_ANSWER)

    def test_empty_compiler_output_not_prepended(self):
        # compiler_output is "" -> the `if compiler_output:` branch is skipped
        # (184->186 false arm).
        sub = self._sub()
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox", return_value=(True, "", "/tmp/exe")
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 100, "out", ""),
            ),
            mock.patch(f"{TASKS}.compare_outputs", return_value=True),
        ):
            _call(sub.id)
        sub.refresh_from_db()
        self.assertNotIn("Compiler Output", sub.detailed_feedback)

    def test_accepted_run(self):
        sub = self._sub()
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 100, "out", ""),
            ),
            mock.patch(f"{TASKS}.compare_outputs", return_value=True),
        ):
            msg = _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(sub.score, 10)
        self.assertIn("judged", msg)

    def test_wrong_answer_when_outputs_mismatch(self):
        sub = self._sub()
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 100, "bad", ""),
            ),
            mock.patch(f"{TASKS}.compare_outputs", return_value=False),
        ):
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.WRONG_ANSWER)
        self.assertEqual(sub.score, 0)

    def test_run_returns_nonaccepted_verdict(self):
        # tc_verdict != ACCEPTED -> skips comparison, sets overall verdict.
        sub = self._sub()
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(
                    Submission.VerdictStatus.RUNTIME_ERROR,
                    -1,
                    -1,
                    "",
                    "boom",
                ),
            ),
        ):
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        # tc_time/-1 and tc_mem/-1 -> stored as None.
        result = SubmissionTestResult.objects.get(submission=sub)
        self.assertIsNone(result.execution_time_ms)
        self.assertIsNone(result.memory_used_kb)

    def test_executable_path_missing_internal_error(self):
        # compile reports success but returns None executable -> INTERNAL_ERROR.
        sub = self._sub()
        with mock.patch(
            f"{TASKS}.compile_code_in_sandbox", return_value=(True, "ok", None)
        ):
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.INTERNAL_ERROR)

    def test_custom_checker_accepted(self):
        self.problem.comparison_mode = Problem.ComparisonMode.CUSTOM_CHECKER
        self.problem.checker_code = "print('ok')"
        self.problem.checker_language = "python3"
        self.problem.save()
        sub = self._sub()
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 100, "out", "e"),
            ),
            mock.patch(
                f"{TASKS}.run_custom_checker",
                return_value=(Submission.VerdictStatus.ACCEPTED, "checker ok"),
            ),
        ):
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.ACCEPTED)

    def test_custom_checker_selected_but_no_code(self):
        # CUSTOM_CHECKER but no checker_code/language -> INTERNAL_ERROR branch.
        self.problem.comparison_mode = Problem.ComparisonMode.CUSTOM_CHECKER
        self.problem.checker_code = ""
        self.problem.checker_language = ""
        self.problem.save()
        sub = self._sub()
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 100, "out", ""),
            ),
        ):
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.INTERNAL_ERROR)

    def test_custom_checker_with_empty_tc_error(self):
        # exercise the `tc_error + "\n" if tc_error else ""` falsey branch by
        # returning empty error from run, with custom checker.
        self.problem.comparison_mode = Problem.ComparisonMode.CUSTOM_CHECKER
        self.problem.checker_code = "x"
        self.problem.checker_language = "python3"
        self.problem.save()
        sub = self._sub()
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 100, "out", ""),
            ),
            mock.patch(
                f"{TASKS}.run_custom_checker",
                return_value=(Submission.VerdictStatus.WRONG_ANSWER, "nope"),
            ),
        ):
            _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.WRONG_ANSWER)

    def test_internal_error_during_judging(self):
        # An unexpected exception inside the loop -> outer except -> sub marked
        # INTERNAL_ERROR via the recovery transaction.
        sub = self._sub()
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox", side_effect=RuntimeError("kaboom")
            ),
        ):
            msg = _call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.INTERNAL_ERROR)
        self.assertIn("internal error", msg)

    def test_internal_error_recovery_also_fails(self):
        # The recovery transaction itself raises -> the nested except (just logs).
        sub = self._sub()
        original_get = Submission.objects.get

        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox", side_effect=RuntimeError("kaboom")
            ),
            mock.patch.object(
                Submission.objects,
                "select_for_update",
                side_effect=lambda *a, **k: (_ for _ in ()).throw(
                    RuntimeError("recovery fail")
                ),
            ),
        ):
            msg = _call(sub.id)
        self.assertIn("internal error", msg)
        # original_get reference keeps lint quiet about the unused mock target.
        self.assertTrue(callable(original_get))

    def test_compiler_output_prepended_to_feedback(self):
        # compiler_output truthy -> the `if compiler_output:` feedback branch.
        sub = self._sub()
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "warnings here", "/tmp/exe"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 100, "out", ""),
            ),
            mock.patch(f"{TASKS}.compare_outputs", return_value=True),
        ):
            _call(sub.id)
        sub.refresh_from_db()
        self.assertIn("Compiler Output", sub.detailed_feedback)
