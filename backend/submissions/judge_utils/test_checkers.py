"""Full line+branch coverage for judge_utils.checkers.run_custom_checker."""

import pathlib
import subprocess
import tempfile
from unittest import mock

from django.test import TestCase

from submissions.judge_utils import checkers
from submissions.judge_utils.checkers import (
    _VERDICT_ACCEPTED,
    _VERDICT_INTERNAL_ERROR,
    _VERDICT_WRONG_ANSWER,
    run_custom_checker,
)


class _FakePopen:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr

    def communicate(self, timeout=None):
        return self._stdout, self._stderr


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

    def test_unsupported_language(self):
        verdict, msg = run_custom_checker(
            "code", "ruby", self.inp, self.uout, self.ans, self.dir
        )
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("Unsupported checker language", msg)

    def test_python_accepted(self):
        with mock.patch.object(
            checkers.subprocess, "Popen", return_value=_FakePopen(returncode=0)
        ):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertIn("Checker STDOUT", msg)

    def test_python_wrong_answer_nonzero_exit(self):
        with mock.patch.object(
            checkers.subprocess, "Popen", return_value=_FakePopen(returncode=1)
        ):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_WRONG_ANSWER)
        self.assertIn("code 1", msg)

    def test_python_timeout_returncode_124(self):
        with mock.patch.object(
            checkers.subprocess, "Popen", return_value=_FakePopen(returncode=124)
        ):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("timed out", msg)

    def test_python_stderr_with_no_resource_line(self):
        # stderr has content but no line matching the resource pattern -> the scan
        # loop runs to completion without setting checker_resource_msg.
        with mock.patch.object(
            checkers.subprocess,
            "Popen",
            return_value=_FakePopen(returncode=0, stderr="just a log line\n"),
        ):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertNotIn("Checker Resources", msg)

    def test_python_stderr_whitespace_only(self):
        # stderr truthy but strips to empty -> the inner `if lines:` is false
        # (covers the 191->197 branch arm).
        with mock.patch.object(
            checkers.subprocess,
            "Popen",
            return_value=_FakePopen(returncode=0, stderr="   \n  "),
        ):
            verdict, _msg = self._run()
        self.assertEqual(verdict, _VERDICT_ACCEPTED)

    def test_python_resource_line_parsed_from_stderr(self):
        # A stderr line with >=6 parts where parts[4] endswith '%' is treated as
        # the resource-usage line.
        stderr = "some log\n0.01 0.00 1234 0 50% 0.02\n"
        with mock.patch.object(
            checkers.subprocess,
            "Popen",
            return_value=_FakePopen(returncode=0, stderr=stderr),
        ):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertIn("Checker Resources", msg)

    def test_python_communicate_timeout(self):
        popen = _FakePopen()
        popen.communicate = mock.Mock(
            side_effect=subprocess.TimeoutExpired(cmd="docker", timeout=1)
        )
        with mock.patch.object(checkers.subprocess, "Popen", return_value=popen):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("communication timeout", msg)

    def test_python_file_not_found(self):
        with mock.patch.object(
            checkers.subprocess, "Popen", side_effect=FileNotFoundError()
        ):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("not found", msg)

    def test_python_generic_exception(self):
        with mock.patch.object(
            checkers.subprocess, "Popen", side_effect=RuntimeError("boom")
        ):
            verdict, msg = self._run()
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("run error", msg)

    def test_cpp_compile_success_then_run_accepted(self):
        def fake_run(cmd, *a, **k):
            (self.dir / "checker_program").write_text("bin")
            return subprocess.CompletedProcess(cmd, 0, stdout="ok", stderr="")

        with mock.patch.object(checkers.subprocess, "run", side_effect=fake_run):
            with mock.patch.object(
                checkers.subprocess, "Popen", return_value=_FakePopen(returncode=0)
            ):
                verdict, _msg = run_custom_checker(
                    "int main(){}", "cpp17", self.inp, self.uout, self.ans, self.dir
                )
        self.assertEqual(verdict, _VERDICT_ACCEPTED)

    def test_cpp_compile_failure_nonzero(self):
        with mock.patch.object(
            checkers.subprocess,
            "run",
            return_value=subprocess.CompletedProcess([], 1, stdout="", stderr="err"),
        ):
            verdict, msg = run_custom_checker(
                "bad", "cpp17", self.inp, self.uout, self.ans, self.dir
            )
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("compile failed", msg)

    def test_cpp_compile_exception(self):
        with mock.patch.object(
            checkers.subprocess, "run", side_effect=RuntimeError("boom")
        ):
            verdict, msg = run_custom_checker(
                "x", "cpp17", self.inp, self.uout, self.ans, self.dir
            )
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("compile failed", msg)
