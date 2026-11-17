"""Wave E items 8/9/10/14 — pre-submit assistance.

- the static lint: rule coverage (python pitfalls, C++ hot-loop endl,
  integer pow, the constraint-aware overflow bands, the INTERACTIVE
  flush check) and the endpoint contract (auth, visibility, language);
- the sample dress-rehearsal run: compile-once + per-sample comparison
  with the problem's real comparison mode, the OUTPUT_ONLY and
  INTERACTIVE arms, and the no-samples / not-visible / not-allowed
  rejections;
- the compile-error explainer table and its serializer hook.
"""

from unittest import mock

from django.test import TestCase
from problems.models import Problem, TestCase as ProblemTestCase
from problems.presubmit import (
    PreSubmitLintView,
    PreSubmitSamplesView,
    lint_submission_code,
)
from rest_framework.test import APIClient, APIRequestFactory
from submissions.explain import explain_compile_errors
from submissions.models import Submission
from submissions.serializers import SubmissionSerializer
from users.models import User

AC = Submission.VerdictStatus.ACCEPTED
WA = Submission.VerdictStatus.WRONG_ANSWER
CE = Submission.VerdictStatus.COMPILE_ERROR

PRESUBMIT = "problems.presubmit"


def _post(action, data, user):
    client = APIClient()
    client.force_authenticate(user=user)
    # Non-router endpoints mount directly under the app prefix:
    # /api/v1/problems/{problem_id}/lint/ (the doubled problems/problems/
    # is the VIEWSET prefix, not these).
    path = f"/api/v1/problems/{data.get('problem_id')}/{action}/"
    return client.post(path, data, format="json")


class LintRulesTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"}, statement_i18n={"en": "S"}
        )

    def _rules(self, code, language="python3", problem=None):
        return [
            w["rule"]
            for w in lint_submission_code(problem or self.problem, language, code)
        ]

    def test_python_rules(self):
        rules = self._rules(
            "try:\n    pass\nexcept:\n    pass\nif x == None:\n    pass\n"
            "def f(a=[]):\n    return a\n"
        )
        self.assertIn("py_bare_except", rules)
        self.assertIn("py_eq_none", rules)
        self.assertIn("py_mutable_default", rules)
        # Line numbers point at the offending lines.
        warn = lint_submission_code(self.problem, "python3", "x = 1\ny = 2\nexcept:\n")
        # bare except on line 3 when present alone
        self.assertEqual(warn[0]["line"], 3)

    def test_cpp_rules(self):
        code = "\n".join(["cout << i << endl;" for _ in range(4)])
        code += "\nlong long s = pow(2, 3);"
        rules = self._rules(code, language="cpp17")
        self.assertIn("cpp_endl_flush", rules)
        self.assertIn("cpp_pow_integer", rules)

    def test_other_cpp_family_languages_lint(self):
        # The elif arm covers the whole C family (c11/cpp20), not just
        # cpp17.
        rules = self._rules(
            "#include <stdio.h>\nint main(){int n; n = pow(2, 3);}",
            language="c11",
        )
        self.assertIn("cpp_pow_integer", rules)

    def test_non_python_cpp_languages_lint_clean(self):
        # java11 (neither the python nor the C arm) lints to nothing —
        # the elif-chain fall-through arm.
        self.assertEqual(
            self._rules(
                "class Main { public static void main(String[] a) {} }",
                language="java11",
            ),
            [],
        )

    def test_no_false_positives_on_clean_code(self):
        self.assertEqual(self._rules("print('hi')\n"), [])
        self.assertEqual(
            self._rules('#include <cstdio>\nint main(){printf("a\\n");}', "cpp17"),
            [],
        )

    def test_constraint_overflow_bands(self):
        big = Problem.objects.create(
            title_i18n={"en": "B"},
            statement_i18n={"en": "S"},
            constraint_max_value=10**10,
        )
        rules = self._rules(
            '#include <cstdio>\nint main(){int s; scanf("%d", &s);}',
            language="cpp17",
            problem=big,
        )
        self.assertIn("int_overflow_64", rules)
        # long long usage silences it; python just gets a note
        self.assertNotIn(
            "int_overflow_64",
            self._rules("long long s;", language="cpp17", problem=big),
        )
        # Beyond 64 bits: the Python note and the C++ __int128 warning.
        # (sqlite cannot store >2^63 in a BigIntegerField, so the beyond-
        # 64-bit problem is a stub — the linter only reads attributes.)
        from unittest import mock as _mock

        huge = _mock.Mock(constraint_max_value=10**30, problem_type="NORMAL")
        self.assertIn("py_big_int_note", self._rules("s = 1", problem=huge))
        self.assertIn(
            "int_overflow_128",
            self._rules("int s;", language="cpp17", problem=huge),
        )
        # No declared constraint -> no overflow reading at all.
        self.assertEqual(self._rules("int s;", language="cpp17"), [])

    def test_interactive_flush_rule(self):
        interactive = Problem.objects.create(
            title_i18n={"en": "I"},
            statement_i18n={"en": "S"},
            problem_type=Problem.ProblemType.INTERACTIVE,
        )
        rules = self._rules("x = input()\nprint(x)", problem=interactive)
        self.assertIn("interactive_no_flush", rules)
        self.assertNotIn(
            "interactive_no_flush",
            self._rules("x = input()\nprint(x, flush=True)", problem=interactive),
        )
        cpp_flushed = self._rules(
            'printf("a\\n"); fflush(stdout);', language="cpp17", problem=interactive
        )
        self.assertNotIn("interactive_no_flush", cpp_flushed)

    def test_multiline_eq_none_falls_back_to_line_one(self):
        # The `== None` regex can straddle a newline while the per-line
        # scan finds nothing — the warning falls back to line 1.
        warnings = lint_submission_code(self.problem, "python3", "x !=\nNone\n")
        rules = [w["rule"] for w in warnings]
        self.assertIn("py_eq_none", rules)
        self.assertEqual(
            next(w for w in warnings if w["rule"] == "py_eq_none")["line"], 1
        )

    def test_oversized_source_returns_nothing(self):
        from problems.presubmit import LINT_SOURCE_CAP

        self.assertEqual(
            lint_submission_code(self.problem, "python3", "x" * (LINT_SOURCE_CAP + 1)),
            [],
        )


class LintEndpointTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.stranger = User.objects.create_user(username="s", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.DRAFT,
        )
        self.problem.test_cases.create(
            input_data="1", expected_output_data="1", is_sample=True, order=1
        )

    def test_requires_authentication(self):
        client = APIClient()  # anonymous: IsAuthenticated answers 401
        response = client.post(
            f"/api/v1/problems/{self.problem.id}/lint/",
            {"language": "python3", "code": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_author_lints_draft_stranger_gets_404(self):
        response = _post(
            "lint",
            {
                "problem_id": self.problem.id,
                "language": "python3",
                "code": "try:\n pass\nexcept:\n pass",
            },
            self.problem.author or self.user,
        )
        self.assertEqual(response.status_code, 404)
        self.problem.author = self.user
        self.problem.save()
        response = _post(
            "lint",
            {
                "problem_id": self.problem.id,
                "language": "python3",
                "code": "try:\n pass\nexcept:\n pass",
            },
            self.user,
        )
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data["count"], 1)

    def test_unknown_language_400(self):
        self.problem.status = Problem.ProblemStatus.APPROVED
        self.problem.save()
        response = _post(
            "lint",
            {"problem_id": self.problem.id, "language": "cobol", "code": "x"},
            self.user,
        )
        self.assertEqual(response.status_code, 400)


class VisibilityArmsTest(TestCase):
    """Direct view calls for the visibility branches the DRF permission
    layer normally precedes (anonymous -> not visible; verifier -> staff
    arm; unknown language on the samples view)."""

    def setUp(self):
        from django.contrib.auth.models import AnonymousUser

        self.factory = APIRequestFactory()
        self.anon = AnonymousUser()
        self.verifier = User.objects.create_user(
            username="v", password="p", role=User.Roles.PROBLEM_VERIFIER
        )
        self.staff = User.objects.create_user(
            username="st", password="p", is_staff=True
        )
        self.problem = Problem.objects.create(
            title_i18n={"en": "D"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.DRAFT,
        )
        self.problem.test_cases.create(
            input_data="1", expected_output_data="1", is_sample=True, order=1
        )

    def _lint(self, user):
        view = PreSubmitLintView()
        request = view.initialize_request(
            self.factory.post("/", {"language": "python3", "code": "x"}, format="json")
        )
        request.user = user
        return view.post(request, problem_id=self.problem.id)

    def test_anonymous_draft_invisible_and_verifier_staff_visible(self):
        self.assertEqual(self._lint(self.anon).status_code, 404)
        self.assertEqual(self._lint(self.verifier).status_code, 200)
        self.assertEqual(self._lint(self.staff).status_code, 200)

    def test_samples_unknown_language_400(self):
        view = PreSubmitSamplesView()
        request = view.initialize_request(
            self.factory.post("/", {"language": "cobol", "code": "x"}, format="json")
        )
        request.user = self.verifier
        response = view.post(request, problem_id=self.problem.id)
        self.assertEqual(response.status_code, 400)


class SampleRunTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
            comparison_mode=Problem.ComparisonMode.EXACT,
        )
        self.tc1 = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="1",
            expected_output_data="1",
            is_sample=True,
            order=1,
        )
        self.tc2 = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="2",
            expected_output_data="2",
            is_sample=True,
            order=2,
        )
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="3",
            expected_output_data="3",
            is_sample=False,
            order=3,
        )

    def _run(self, code, problem=None):
        return _post(
            "run-samples",
            {
                "problem_id": (problem or self.problem).id,
                "language": "python3",
                "code": code,
            },
            self.user,
        )

    def test_all_samples_pass(self):
        with (
            mock.patch(
                f"{PRESUBMIT}.compile_code_in_sandbox",
                return_value=(True, "", "/tmp/x"),
            ),
            mock.patch(
                f"{PRESUBMIT}.run_code_in_sandbox",
                side_effect=lambda exe, lang, stdin, t, m, wd, libs: (
                    AC,
                    10,
                    512,
                    stdin,
                    "",
                ),
            ),
        ):
            response = self._run("print(1)")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["compile_error"])
        self.assertEqual(len(response.data["samples"]), 2)
        self.assertTrue(all(s["verdict"] == AC for s in response.data["samples"]))

    def test_mismatch_reports_diff_data(self):
        with (
            mock.patch(
                f"{PRESUBMIT}.compile_code_in_sandbox",
                return_value=(True, "", "/tmp/x"),
            ),
            mock.patch(
                f"{PRESUBMIT}.run_code_in_sandbox",
                return_value=(AC, 10, 512, "9", ""),
            ),
        ):
            response = self._run("print(9)")
        self.assertEqual(response.status_code, 200)
        first = response.data["samples"][0]
        self.assertEqual(first["verdict"], WA)
        self.assertEqual(first["expected"], "1")
        self.assertEqual(first["output"], "9")
        self.assertTrue(first["mismatch_hint"])

    def test_runtime_error_sample(self):
        with (
            mock.patch(
                f"{PRESUBMIT}.compile_code_in_sandbox",
                return_value=(True, "", "/tmp/x"),
            ),
            mock.patch(
                f"{PRESUBMIT}.run_code_in_sandbox",
                return_value=(
                    Submission.VerdictStatus.RUNTIME_ERROR,
                    -1,
                    -1,
                    "",
                    "traceback",
                ),
            ),
        ):
            response = self._run("1/0")
        self.assertEqual(response.data["samples"][0]["verdict"], "RE")
        self.assertIsNone(response.data["samples"][0]["expected"])

    def test_tle_sample_records_timeout_audit_row(self):
        from scratch.models import ScratchRun

        with (
            mock.patch(
                f"{PRESUBMIT}.compile_code_in_sandbox",
                return_value=(True, "", "/tmp/x"),
            ),
            mock.patch(
                f"{PRESUBMIT}.run_code_in_sandbox",
                return_value=(
                    Submission.VerdictStatus.TIME_LIMIT_EXCEEDED,
                    -1,
                    -1,
                    "",
                    "",
                ),
            ),
        ):
            response = self._run("while True: pass")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["samples"][0]["verdict"], "TLE")
        # The audit row marks the worst outcome across samples (TIMEOUT
        # outranks RUNTIME_ERROR).
        record = ScratchRun.objects.filter(
            user=self.user, stdin_data=f"samples:{self.problem.id}"
        ).latest("id")
        self.assertEqual(record.status, ScratchRun.Status.TIMEOUT)

    def test_tle_then_re_keeps_timeout_as_worst(self):
        from scratch.models import ScratchRun

        with (
            mock.patch(
                f"{PRESUBMIT}.compile_code_in_sandbox",
                return_value=(True, "", "/tmp/x"),
            ),
            mock.patch(
                f"{PRESUBMIT}.run_code_in_sandbox",
                side_effect=[
                    (
                        Submission.VerdictStatus.TIME_LIMIT_EXCEEDED,
                        -1,
                        -1,
                        "",
                        "",
                    ),
                    (
                        Submission.VerdictStatus.RUNTIME_ERROR,
                        -1,
                        -1,
                        "",
                        "traceback",
                    ),
                ],
            ),
        ):
            response = self._run("mixed")
        self.assertEqual(response.status_code, 200)
        record = ScratchRun.objects.filter(
            user=self.user, stdin_data=f"samples:{self.problem.id}"
        ).latest("id")
        # A later RE cannot downgrade an earlier TIMEOUT.
        self.assertEqual(record.status, ScratchRun.Status.TIMEOUT)

    def test_compile_error_short_circuits(self):
        with mock.patch(
            f"{PRESUBMIT}.compile_code_in_sandbox",
            return_value=(False, "error: expected ';'", None),
        ):
            response = self._run("print(")
        self.assertTrue(response.data["compile_error"])
        self.assertEqual(response.data["samples"], [])

    def test_output_only_compares_answer_text(self):
        self.problem.problem_type = Problem.ProblemType.OUTPUT_ONLY
        self.problem.save()
        response = self._run("1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["samples"]), 2)
        verdicts = [s["verdict"] for s in response.data["samples"]]
        # The answer text matches sample 1 ("1") and misses sample 2 ("2").
        self.assertEqual(verdicts, [AC, WA])

    def test_interactive_rejected_and_no_samples_rejected(self):
        self.problem.problem_type = Problem.ProblemType.INTERACTIVE
        self.problem.save()
        response = self._run("print(1)")
        self.assertEqual(response.status_code, 400)
        empty = Problem.objects.create(
            title_i18n={"en": "E"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
        )
        response = _post(
            "run-samples",
            {"problem_id": empty.id, "language": "python3", "code": "x"},
            self.user,
        )
        self.assertEqual(response.status_code, 400)

    def test_disallowed_language_rejected(self):
        self.problem.allowed_languages = ["cpp17"]
        self.problem.save()
        response = self._run("print(1)")
        self.assertEqual(response.status_code, 400)

    def test_invisible_problem_404_and_unknown_404(self):
        self.problem.status = Problem.ProblemStatus.DRAFT
        self.problem.save()
        response = self._run("print(1)")
        self.assertEqual(response.status_code, 404)
        response = _post(
            "run-samples",
            {"problem_id": 999999, "language": "python3", "code": "x"},
            self.user,
        )
        self.assertEqual(response.status_code, 404)


class CompileHintsTest(TestCase):
    """Item 14: the explainer table + the serializer hook."""

    def test_table_mappings(self):
        hints = explain_compile_errors("main.cpp:3:1: error: expected ';' before '}'")
        self.assertEqual(len(hints), 1)
        self.assertIn("semicolon", hints[0]["hint_en"])
        self.assertIn("punct", hints[0]["hint_ro"].lower())

        hints = explain_compile_errors("error: 'x' was not declared in this scope")
        self.assertEqual(len(hints), 1)

        hints = explain_compile_errors("NameError: name 'y' is not defined")
        self.assertEqual(len(hints), 1)

    def test_no_match_and_cap(self):
        self.assertEqual(explain_compile_errors("weird toolchain noise"), [])
        self.assertEqual(explain_compile_errors(None), [])
        wall = " ".join(
            [
                "expected ';' x",
                "'v' was not declared in this scope",
                "NameError: not defined",
                "invalid conversion from 'const char*' to 'int'",
                "expected an indented block",
            ]
        )
        self.assertEqual(len(explain_compile_errors(wall)), 3)

    def test_serializer_hook(self):
        from problems.models import Problem as P

        user = User.objects.create_user(username="u2", password="p")
        problem = P.objects.create(title_i18n={"en": "P"}, statement_i18n={"en": "S"})
        ce = Submission.objects.create(
            user=user,
            problem=problem,
            language="cpp17",
            code="x",
            verdict=CE,
            detailed_feedback="error: expected ';' before 'return'",
        )
        data = SubmissionSerializer(ce).data
        self.assertEqual(len(data["compile_hints"]), 1)
        ok = Submission.objects.create(
            user=user,
            problem=problem,
            language="cpp17",
            code="x",
            verdict=AC,
            detailed_feedback="fine",
        )
        self.assertEqual(SubmissionSerializer(ok).data["compile_hints"], [])
