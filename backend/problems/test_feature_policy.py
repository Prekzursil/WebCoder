"""Wave C — per-problem library & feature policy (creator-controlled
restrictions): pure scanner tests, authoring-time shape validation, the
submit-time 400 gate, judge-time enforcement, and the generated Python
import guard executed for real.
"""

import pathlib
import tempfile
import unittest

from django.test import TestCase
from rest_framework.test import APIClient

from problems.feature_policy import (
    build_python_import_guard,
    scan_policy_violations,
    validate_policy_shape,
)
from problems.models import Problem
from problems.serializers import ProblemSerializer
from submissions.models import Submission
from submissions.tasks import judge_submission_task
from users.models import User


class PolicyShapeValidationTests(unittest.TestCase):
    def test_empty_and_none_are_valid(self):
        self.assertEqual(validate_policy_shape(None), [])
        self.assertEqual(validate_policy_shape({}), [])

    def test_valid_policy_passes(self):
        policy = {
            "python3": {
                "banned_stdlib": ["re", "itertools"],
                "banned": ["numpy"],
                "allowed": ["sympy==1.12"],
            },
            "cpp17": {"banned": ["boost"]},
            "banned_features": ["py-no-string-ops"],
        }
        self.assertEqual(validate_policy_shape(policy), [])

    def test_unknown_language_rejected(self):
        self.assertTrue(validate_policy_shape({"cobol": {"banned": ["x"]}}))

    def test_unknown_key_rejected(self):
        problems = validate_policy_shape({"python3": {"bannedx": ["x"]}})
        self.assertTrue(any("bannedx" in p for p in problems))

    def test_unknown_feature_ban_rejected(self):
        problems = validate_policy_shape({"banned_features": ["py-no-loops"]})
        self.assertTrue(problems)

    def test_non_list_value_rejected(self):
        problems = validate_policy_shape({"python3": {"banned": "numpy"}})
        self.assertTrue(problems)

    def test_non_dict_entry_rejected(self):
        self.assertTrue(validate_policy_shape({"python3": ["numpy"]}))

    def test_non_dict_policy_rejected(self):
        self.assertTrue(validate_policy_shape(["numpy"]))


PY_BAN_RE = {"python3": {"banned_stdlib": ["re"]}}
PY_BAN_LIB = {"python3": {"banned": ["numpy"]}}
PY_NO_STRING = {"banned_features": ["py-no-string-ops"]}
CPP_BAN_BOOST = {"cpp17": {"banned": ["boost"]}}
JAVA_BAN_FOO = {"java11": {"banned": ["foo.bar"]}}


class PythonScannerTests(unittest.TestCase):
    def test_banned_stdlib_import_detected(self):
        code = "import re\nprint(re.match('a', 'a'))\n"
        violations = scan_policy_violations(code, "python3", PY_BAN_RE)
        self.assertEqual(len(violations), 1)
        self.assertIn("re", violations[0])
        self.assertIn("forbids", violations[0])

    def test_banned_stdlib_from_import_detected(self):
        code = "from itertools import permutations\nprint(list(permutations([1])))\n"
        policy = {"python3": {"banned_stdlib": ["itertools"]}}
        self.assertTrue(scan_policy_violations(code, "python3", policy))

    def test_clean_stdlib_use_passes(self):
        code = "import math\nprint(math.gcd(12, 18))\n"
        self.assertEqual(scan_policy_violations(code, "python3", PY_BAN_RE), [])

    def test_banned_pip_library_detected(self):
        code = "import numpy as np\nprint(np.array([1]))\n"
        self.assertTrue(scan_policy_violations(code, "python3", PY_BAN_LIB))

    def test_syntax_error_is_not_a_policy_violation(self):
        # Unparseable sources are the judge's CE, not this scanner's call.
        self.assertEqual(scan_policy_violations("def (", "python3", PY_BAN_RE), [])

    def test_string_index_bypass_detected(self):
        # The owner's canonical example: digit extraction shortcut by
        # treating the number as a string and indexing s[i].
        code = "n = input()\nprint(sum(int(c) for c in n[:3]))\n"
        self.assertTrue(scan_policy_violations(code, "python3", PY_NO_STRING))

    def test_string_method_bypass_detected(self):
        code = "s = input()\nprint(s.replace('0', ''))\n"
        violations = scan_policy_violations(code, "python3", PY_NO_STRING)
        self.assertEqual(len(violations), 1)
        self.assertIn(".replace()", violations[0])

    def test_arithmetic_solution_passes(self):
        code = (
            "n = int(input())\n"
            "total = 0\n"
            "while n > 0:\n"
            "    total += n % 10\n"
            "    n //= 10\n"
            "print(total)\n"
        )
        self.assertEqual(scan_policy_violations(code, "python3", PY_NO_STRING), [])

    def test_input_strip_chain_is_derived(self):
        # input().split() keeps the value string-derived (one hop).
        code = "parts = input().split()\nprint(parts[0])\n"
        self.assertTrue(scan_policy_violations(code, "python3", PY_NO_STRING))

    def test_feature_ban_is_best_effort_documented(self):
        # Aliasing through a function boundary evades the static detector —
        # the documented reason feature bans are guardrails, not sandbox
        # boundaries (imports carry the hard enforcement).
        code = "def get():\n    return input()\ns = get()\nprint(s[0])\n"
        self.assertEqual(scan_policy_violations(code, "python3", PY_NO_STRING), [])


class CppScannerTests(unittest.TestCase):
    def test_boost_angle_include_detected(self):
        code = "#include <boost/regex.hpp>\n#include <iostream>\nint main(){}\n"
        violations = scan_policy_violations(code, "cpp17", CPP_BAN_BOOST)
        self.assertEqual(len(violations), 1)
        self.assertIn("boost/regex.hpp", violations[0])

    def test_boost_quoted_include_detected(self):
        code = '#include "boost/multiprecision/cpp_int.hpp"\nint main(){}\n'
        self.assertTrue(scan_policy_violations(code, "cpp17", CPP_BAN_BOOST))

    def test_standard_headers_pass(self):
        code = "#include <bits/stdc++.h>\nint main(){}\n"
        self.assertEqual(scan_policy_violations(code, "cpp17", CPP_BAN_BOOST), [])

    def test_c11_has_the_same_header_scanner(self):
        # Policy keys are exact language ids — an author banning Boost for
        # C submissions keys the policy under "c11".
        code = "#include <boost/regex.hpp>\nint main(){}\n"
        policy = {"c11": {"banned": ["boost"]}}
        self.assertTrue(scan_policy_violations(code, "c11", policy))


class JavaScannerTests(unittest.TestCase):
    def test_banned_package_detected(self):
        code = "import foo.bar.Baz;\npublic class Main {}\n"
        self.assertTrue(scan_policy_violations(code, "java11", JAVA_BAN_FOO))

    def test_standard_imports_pass(self):
        code = "import java.util.Scanner;\npublic class Main {}\n"
        self.assertEqual(scan_policy_violations(code, "java11", JAVA_BAN_FOO), [])


class ImportGuardTests(unittest.TestCase):
    """The generated guard executes for real, in a scratch directory."""

    def test_guard_blocks_banned_import_at_runtime(self):
        guard = build_python_import_guard(["re"])
        with tempfile.TemporaryDirectory() as tmp:
            workdir = pathlib.Path(tmp)
            (workdir / "user_code.py").write_text(
                "import importlib\nimportlib.import_module('re')\n",
                encoding="utf-8",
            )
            (workdir / "_wc_guard.py").write_text(guard, encoding="utf-8")
            import subprocess
            import sys

            result = subprocess.run(
                [sys.executable, "_wc_guard.py"],
                cwd=str(workdir),
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("banned on this problem", result.stderr)

    def test_guard_lets_allowed_imports_through(self):
        guard = build_python_import_guard(["re"])
        with tempfile.TemporaryDirectory() as tmp:
            workdir = pathlib.Path(tmp)
            (workdir / "user_code.py").write_text(
                "import math\nprint(math.gcd(12, 18))\n",
                encoding="utf-8",
            )
            (workdir / "_wc_guard.py").write_text(guard, encoding="utf-8")
            import subprocess
            import sys

            result = subprocess.run(
                [sys.executable, "_wc_guard.py"],
                cwd=str(workdir),
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("6", result.stdout)

    def test_guard_preserves_main_and_argv_semantics(self):
        guard = build_python_import_guard(["re"])
        with tempfile.TemporaryDirectory() as tmp:
            workdir = pathlib.Path(tmp)
            (workdir / "user_code.py").write_text(
                "import sys\n"
                "assert __name__ == '__main__'\n"
                "assert sys.argv[0] == 'user_code.py'\n"
                "print('ok')\n",
                encoding="utf-8",
            )
            (workdir / "_wc_guard.py").write_text(guard, encoding="utf-8")
            import subprocess
            import sys

            result = subprocess.run(
                [sys.executable, "_wc_guard.py"],
                cwd=str(workdir),
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stderr)


class ProblemPolicyAuthoringTest(TestCase):
    def test_serializer_round_trips_the_policy(self):
        user = User.objects.create_user(
            username="policyauthor", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        serializer = ProblemSerializer(
            data={
                "title_i18n": {"en": "P"},
                "statement_i18n": {"en": "S"},
                "library_policy": {
                    "python3": {"banned_stdlib": ["re"]},
                    "banned_features": ["py-no-string-ops"],
                },
            },
            context={"request": None},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        problem = serializer.save(author=user)
        self.assertEqual(problem.library_policy["python3"]["banned_stdlib"], ["re"])

    def test_serializer_rejects_unknown_shape(self):
        serializer = ProblemSerializer(
            data={
                "title_i18n": {"en": "P"},
                "statement_i18n": {"en": "S"},
                "library_policy": {"python3": {"nope": ["x"]}},
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("library_policy", serializer.errors)


class SubmitTimePolicyGateTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="sub", password="p")
        self.client.force_authenticate(self.user)
        self.problem = Problem.objects.create(
            title_i18n={"en": "Digits"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
            library_policy={
                "python3": {"banned_stdlib": ["re"]},
                "banned_features": ["py-no-string-ops"],
            },
        )

    def _submit(self, code):
        return self.client.post(
            "/api/v1/submissions/submit/",
            {
                "problem": self.problem.id,
                "language": "python3",
                "code": code,
            },
            format="json",
        )

    def test_banned_import_rejected_with_400(self):
        resp = self._submit("import re\nprint(re)\n")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Banned standard-library import", str(resp.data))

    def test_string_bypass_rejected_with_400(self):
        resp = self._submit("s = input()\nprint(s[0])\n")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Banned feature", str(resp.data))

    def test_compliant_solution_accepted(self):
        from unittest import mock

        with mock.patch("submissions.views.judge_task"):
            resp = self._submit("n = int(input())\nprint(n % 10)\n")
        self.assertEqual(resp.status_code, 201, resp.data)


class JudgeTimePolicyTests(TestCase):
    """Defense in depth: the judge re-scans the exact submitted bytes even
    when a client skipped the API validation."""

    def test_policy_violation_short_circuits_to_compile_error(self):
        user = User.objects.create_user(username="jt", password="p")
        problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
            library_policy={"python3": {"banned_stdlib": ["re"]}},
        )
        submission = Submission.objects.create(
            user=user,
            problem=problem,
            language="python3",
            code="import re\n",
        )
        result = judge_submission_task.run(submission.id)
        submission.refresh_from_db()
        self.assertEqual(submission.verdict, Submission.VerdictStatus.COMPILE_ERROR)
        self.assertIn("policy violation", submission.detailed_feedback)
        self.assertIn("policy violation", result)


class CoverageCompletenessTests(unittest.TestCase):
    """Single-branch gates for the defensive arms of the policy module."""

    def test_malformed_policy_accessors_tolerated(self):
        # A non-dict policy (bad legacy data) must never crash the judge.
        from problems.feature_policy import (
            allowed_libraries,
            banned_features,
            banned_libraries,
            banned_stdlib_modules,
        )

        self.assertEqual(banned_stdlib_modules(["nope"], "python3"), [])
        self.assertEqual(banned_libraries("not-a-dict", "python3"), [])
        self.assertEqual(allowed_libraries(42, "python3"), [])
        self.assertEqual(banned_features(["x"]), [])
        self.assertEqual(banned_features("not-a-dict"), [])

    def test_banned_features_non_list_shape_error(self):
        problems = validate_policy_shape({"banned_features": "nope"})
        self.assertTrue(any("must be a list" in p for p in problems))

    def test_banned_features_key_skipped_in_language_loop(self):
        policy = {"banned_features": [], "python3": {"banned": ["re"]}}
        self.assertEqual(validate_policy_shape(policy), [])

    def test_scan_ignores_empty_policy_and_empty_code(self):
        self.assertEqual(scan_policy_violations("import re", "python3", None), [])
        self.assertEqual(scan_policy_violations("", "python3", PY_BAN_RE), [])

    def test_scan_cpp_with_policy_for_other_language_only(self):
        # cpp17 submission against a policy keyed for python3 only.
        code = "#include <boost/regex.hpp>\nint main(){}\n"
        self.assertEqual(
            scan_policy_violations(code, "cpp17", {"python3": {"banned": ["x"]}}),
            [],
        )

    def test_scan_java_with_policy_for_other_language_only(self):
        code = "import foo.bar.Baz;\npublic class M {}\n"
        self.assertEqual(scan_policy_violations(code, "java11", {"python3": {}}), [])

    def test_scan_unsupported_language_family_is_noop(self):
        # pascal/go/... have no detectors yet — scan is a no-op, by design.
        self.assertEqual(
            scan_policy_violations("program P; begin end.", "pascal", CPP_BAN_BOOST),
            [],
        )

    def test_non_name_assign_targets_ignored(self):
        # `x[0] = input()` / tuple unpacking are not simple derivations.
        code = "x = [0]\nx[0] = input()\nprint(x)\n"
        self.assertEqual(scan_policy_violations(code, "python3", PY_NO_STRING), [])

    def test_relative_import_is_not_a_root_match(self):
        # `from . import x` has no absolute root — ignored by design.
        code = "from . import sibling\nprint(sibling)\n"
        self.assertEqual(scan_policy_violations(code, "python3", PY_BAN_RE), [])

    def test_banned_lib_without_usage_is_clean(self):
        code = "import math\nprint(math.pi)\n"
        self.assertEqual(scan_policy_violations(code, "python3", PY_BAN_LIB), [])

    def test_feature_ban_with_no_input_usage_is_clean(self):
        self.assertEqual(
            scan_policy_violations("print(1)\n", "python3", PY_NO_STRING),
            [],
        )

    def test_derived_name_without_string_ops_is_clean(self):
        # Holding the raw input is fine; only indexing/str-methods flag.
        code = "s = input()\nprint(s)\n"
        self.assertEqual(scan_policy_violations(code, "python3", PY_NO_STRING), [])


class GuardedExecutionTests(TestCase):
    """The judged python3 run routes through the generated guard when the
    problem bans stdlib modules (execution.py), and a compliant policy
    never short-circuits the judge loop (tasks.py branch coverage)."""

    def setUp(self):
        self.user = User.objects.create_user(username="gx", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
            library_policy={"python3": {"banned_stdlib": ["re"]}},
        )
        self.sub = Submission.objects.create(
            user=self.user,
            problem=self.problem,
            language="python3",
            code="n = int(input())\nprint(n % 10)\n",
        )

    def test_guard_written_and_used_in_run_argv(self):
        import pathlib
        import tempfile
        from unittest import mock

        from submissions.judge_utils.execution import run_code_in_sandbox
        from submissions.models import Submission as Sub

        with tempfile.TemporaryDirectory() as tmp:
            workdir = pathlib.Path(tmp)
            (workdir / "user_code.py").write_text("print(1)\n")

            def fake_run(argv, **kwargs):
                return mock.Mock(
                    returncode=0,
                    stdout="1\n",
                    stderr="0.01 0.01 1024 0 90.0% 0.02\n",
                )

            with mock.patch("subprocess.run", side_effect=fake_run):
                verdict, *_ = run_code_in_sandbox(
                    str(workdir / "user_code.py"),
                    "python3",
                    "1",
                    1000,
                    262144,
                    workdir,
                    None,
                    banned_stdlib_modules=["re"],
                )
            self.assertEqual(verdict, Sub.VerdictStatus.ACCEPTED)
            guard = workdir / "_wc_guard.py"
            self.assertTrue(guard.exists())
            self.assertIn("_BANNED = frozenset(['re'])", guard.read_text())

    def test_guard_with_custom_libs_uses_pythonpath(self):
        import pathlib
        import tempfile
        from unittest import mock

        from submissions.judge_utils.execution import run_code_in_sandbox

        with tempfile.TemporaryDirectory() as tmp:
            workdir = pathlib.Path(tmp)
            (workdir / "user_code.py").write_text("print(1)\n")
            seen: dict = {}

            def fake_run(argv, **kwargs):
                seen["argv"] = argv
                return mock.Mock(
                    returncode=0,
                    stdout="1\n",
                    stderr="0.01 0.01 1024 0 90.0% 0.02\n",
                )

            with mock.patch("subprocess.run", side_effect=fake_run):
                run_code_in_sandbox(
                    str(workdir / "user_code.py"),
                    "python3",
                    "1",
                    1000,
                    262144,
                    workdir,
                    ["numpy"],
                    banned_stdlib_modules=["re"],
                )
            argv = " ".join(seen["argv"])
            self.assertIn("_wc_guard.py", argv)
            self.assertIn("PYTHONPATH=libs", argv)

    def test_compliant_policy_proceeds_to_full_judging(self):
        from unittest import mock

        TASKS = "submissions.tasks"
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/user_code.py"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(
                    Submission.VerdictStatus.ACCEPTED,
                    10,
                    1024,
                    "7",
                    "",
                ),
            ),
        ):
            judge_submission_task.run(self.sub.id)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.verdict, Submission.VerdictStatus.ACCEPTED)


class BlockConfigValidationTests(TestCase):
    """Wave D: block-programming problems — serializer shape rules."""

    def _serializer(self, block_config):
        return ProblemSerializer(
            data={
                "title_i18n": {"en": "B"},
                "statement_i18n": {"en": "S"},
                "block_config": block_config,
            }
        )

    def test_valid_config_round_trips(self):
        serializer = self._serializer(
            {"generator": "nodejs20", "starter": "<xml></xml>"}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = User.objects.create_user(
            username="blockauthor", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        problem = serializer.save(author=user)
        self.assertEqual(problem.block_config["generator"], "nodejs20")

    def test_empty_config_is_valid(self):
        self.assertTrue(self._serializer({}).is_valid())

    def test_non_dict_config_rejected(self):
        self.assertFalse(self._serializer(["bad"]).is_valid())

    def test_unknown_generator_rejected(self):
        serializer = self._serializer({"generator": "pascal"})
        self.assertFalse(serializer.is_valid())
        self.assertIn("block_config", serializer.errors)

    def test_oversized_toolbox_rejected(self):
        serializer = self._serializer({"toolbox": "x" * 100_001})
        self.assertFalse(serializer.is_valid())

    def test_unknown_key_rejected(self):
        serializer = self._serializer({"nope": 1})
        self.assertFalse(serializer.is_valid())
