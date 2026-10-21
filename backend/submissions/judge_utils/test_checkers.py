"""Full line+branch coverage for judge_utils.checkers.run_custom_checker.

The compile step dispatches through compilation.run_compile_step (mock at
``compilation.subprocess.run``) and the checker run through
``checkers.subprocess.run``; both mocked so the suite is hermetic.
"""

import pathlib
import subprocess
import tempfile
from unittest import mock

from django.test import TestCase, override_settings

from submissions.judge_utils import checkers
from submissions.judge_utils.checkers import (
    _VERDICT_ACCEPTED,
    _VERDICT_INTERNAL_ERROR,
    _VERDICT_WRONG_ANSWER,
    run_custom_checker,
)


def _fake_completed(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(
        args=["docker"], returncode=returncode, stdout=stdout, stderr=stderr
    )


class RunCustomCheckerTest(TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self._td.name)
        self.addCleanup(self._td.cleanup)
        self.inp = self.dir / "input.txt"
        self.uout = self.dir / "user_output.txt"
        self.ans = self.dir / "answer.txt"
        for f in (self.inp, self.uout, self.ans):
            f.write_text("x")

    def _run(self, lang="python3"):
        return run_custom_checker(
            "print('ok')", lang, self.inp, self.uout, self.ans, self.dir
        )

    def _patch_run(self, **kw):
        return mock.patch.object(
            checkers.subprocess, "run", return_value=_fake_completed(**kw)
        )

    def test_unsupported_language(self):
        verdict, msg = run_custom_checker(
            "code", "ruby", self.inp, self.uout, self.ans, self.dir
        )
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("Unsupported checker language", msg)

    def test_java_rejected_as_checker_language(self):
        # The registry defines java11, but its run argv is a fixed class
        # name — it cannot take checker file arguments.
        verdict, msg = run_custom_checker(
            "class Main{}", "java11", self.inp, self.uout, self.ans, self.dir
        )
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("Unsupported checker language", msg)

    def test_python_accepted(self):
        with self._patch_run(returncode=0):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertIn("Checker STDOUT", msg)

    def test_python_argv_uses_registry_and_relative_files(self):
        seen: dict = {}

        def fake_run(cmd, *a, **k):
            seen["argv"] = cmd
            seen["kwargs"] = k
            return _fake_completed(returncode=0)

        with mock.patch.object(checkers.subprocess, "run", side_effect=fake_run):
            self._run()
        argv = seen["argv"]
        self.assertIn("python", argv)
        self.assertIn("checker.py", argv)
        self.assertIn("input.txt", argv)
        self.assertIn("user_output.txt", argv)
        self.assertIn("answer.txt", argv)
        # Resource harness + deadline wrap the checker.
        self.assertIn("/usr/bin/time", argv)
        self.assertIn("timeout", argv)
        # Default backend is local -> per-run docker run with the registry
        # image and a read-only bind-mount of the checker workspace.
        self.assertEqual(argv[:3], ["docker", "run", "--rm"])
        self.assertIn("python:3.11-slim", argv)
        self.assertIn(f"{self.dir.resolve()}:/app:ro", argv)

    def test_python_wrong_answer_nonzero_exit(self):
        with self._patch_run(returncode=1):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_WRONG_ANSWER)
        self.assertIn("code 1", msg)

    def test_python_timeout_returncode_124(self):
        with self._patch_run(returncode=124):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("timed out", msg)

    def test_python_stderr_with_no_resource_line(self):
        # stderr has content but no line matching the resource pattern -> the scan
        # loop runs to completion without setting checker_resource_msg.
        with self._patch_run(returncode=0, stderr="just a log line\n"):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertNotIn("Checker Resources", msg)

    def test_python_stderr_whitespace_only(self):
        # stderr truthy but strips to empty -> the inner `if lines:` is false.
        with self._patch_run(returncode=0, stderr="   \n  "):
            verdict, _msg = self._run()
        self.assertEqual(verdict, _VERDICT_ACCEPTED)

    def test_python_resource_line_parsed_from_stderr(self):
        # A stderr line with >=6 parts where parts[4] endswith '%' is treated as
        # the resource-usage line.
        stderr = "some log\n0.01 0.00 1234 0 50% 0.02\n"
        with self._patch_run(returncode=0, stderr=stderr):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertIn("Checker Resources", msg)

    def test_python_communicate_timeout(self):
        with mock.patch.object(
            checkers.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired(cmd="docker", timeout=1),
        ):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("communication timeout", msg)

    def test_python_file_not_found(self):
        with mock.patch.object(
            checkers.subprocess, "run", side_effect=FileNotFoundError()
        ):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("not found", msg)

    def test_python_generic_exception(self):
        with mock.patch.object(
            checkers.subprocess, "run", side_effect=RuntimeError("boom")
        ):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("run error", msg)

    def test_cpp_compile_success_then_run_accepted(self):
        seen_run_argv: list[list[str]] = []

        def fake_checker_run(cmd, *a, **k):
            seen_run_argv.append(cmd)
            return _fake_completed(returncode=0)

        # NOTE: patching checkers.subprocess.run AND compilation.subprocess.run
        # separately is impossible (both names refer to the same subprocess
        # module, so the patches would stack on one attribute). The compile
        # step is therefore patched at its call site in checkers' namespace.
        with mock.patch.object(
            checkers, "run_compile_step", return_value=(True, "compile ok")
        ):
            with mock.patch.object(
                checkers.subprocess, "run", side_effect=fake_checker_run
            ):
                verdict, _msg = run_custom_checker(
                    "int main(){}", "cpp17", self.inp, self.uout, self.ans, self.dir
                )
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        argv = seen_run_argv[0]
        self.assertIn("./checker_program", argv)
        self.assertIn("input.txt", argv)

    def test_cpp_compile_failure_nonzero(self):
        with mock.patch.object(
            checkers,
            "run_compile_step",
            return_value=(False, "STDOUT:\n\nSTDERR:\nsyntax error"),
        ):
            verdict, msg = run_custom_checker(
                "bad", "cpp17", self.inp, self.uout, self.ans, self.dir
            )
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("compile failed", msg)
        self.assertIn("syntax error", msg)

    def test_cpp_compile_exception(self):
        with mock.patch.object(
            checkers,
            "run_compile_step",
            side_effect=RuntimeError("boom"),
        ):
            verdict, msg = run_custom_checker(
                "x", "cpp17", self.inp, self.uout, self.ans, self.dir
            )
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("compile failed", msg)

    def test_container_backend_execs_checker_into_judge_runner(self):
        seen_argv: list[list[str]] = []

        def fake_checker_run(cmd, *a, **k):
            seen_argv.append(cmd)
            return _fake_completed(returncode=0)

        with override_settings(JUDGE_BACKEND="container"):
            with mock.patch.object(
                checkers.subprocess, "run", side_effect=fake_checker_run
            ):
                verdict, _msg = self._run()
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        argv = seen_argv[0]
        self.assertEqual(argv[:2], ["docker", "exec"])
        self.assertIn("webcoder-judge-runner", argv)
        self.assertIn(str(self.dir), argv)
        self.assertNotIn("-v", argv)
        self.assertIn("checker.py", argv)
