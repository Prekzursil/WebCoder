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
        verdict, _frac, msg = run_custom_checker(
            "code", "cobol", self.inp, self.uout, self.ans, self.dir
        )
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("Unsupported checker language", msg)

    def test_java_rejected_as_checker_language(self):
        # The registry defines java11, but its run argv is a fixed class
        # name — it cannot take checker file arguments.
        verdict, _frac, msg = run_custom_checker(
            "class Main{}", "java11", self.inp, self.uout, self.ans, self.dir
        )
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("Unsupported checker language", msg)

    def test_python_accepted(self):
        with self._patch_run(returncode=0):
            verdict, _frac, msg = self._run()
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
            verdict, _frac, msg = self._run()
        self.assertEqual(verdict, _VERDICT_WRONG_ANSWER)
        self.assertIn("code 1", msg)

    def test_python_timeout_returncode_124(self):
        with self._patch_run(returncode=124):
            verdict, _frac, msg = self._run()
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("timed out", msg)

    def test_python_stderr_with_no_resource_line(self):
        # stderr has content but no line matching the resource pattern -> the scan
        # loop runs to completion without setting checker_resource_msg.
        with self._patch_run(returncode=0, stderr="just a log line\n"):
            verdict, _frac, msg = self._run()
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertNotIn("Checker Resources", msg)

    def test_python_stderr_whitespace_only(self):
        # stderr truthy but strips to empty -> the inner `if lines:` is false.
        with self._patch_run(returncode=0, stderr="   \n  "):
            verdict, _frac, _msg = self._run()
        self.assertEqual(verdict, _VERDICT_ACCEPTED)

    def test_python_resource_line_parsed_from_stderr(self):
        # A stderr line with >=6 parts where parts[4] endswith '%' is treated as
        # the resource-usage line.
        stderr = "some log\n0.01 0.00 1234 0 50% 0.02\n"
        with self._patch_run(returncode=0, stderr=stderr):
            verdict, _frac, msg = self._run()
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertIn("Checker Resources", msg)

    def test_python_communicate_timeout(self):
        with mock.patch.object(
            checkers.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired(cmd="docker", timeout=1),
        ):
            verdict, _frac, msg = self._run()
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("communication timeout", msg)

    def test_python_file_not_found(self):
        with mock.patch.object(
            checkers.subprocess, "run", side_effect=FileNotFoundError()
        ):
            verdict, _frac, msg = self._run()
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("not found", msg)

    def test_python_generic_exception(self):
        with mock.patch.object(
            checkers.subprocess, "run", side_effect=RuntimeError("boom")
        ):
            verdict, _frac, msg = self._run()
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
                verdict, _frac, _msg = run_custom_checker(
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
            verdict, _frac, msg = run_custom_checker(
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
            verdict, _frac, msg = run_custom_checker(
                "x", "cpp17", self.inp, self.uout, self.ans, self.dir
            )
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("compile error", msg)

    def test_container_backend_execs_checker_into_judge_runner(self):
        seen_argv: list[list[str]] = []

        def fake_checker_run(cmd, *a, **k):
            seen_argv.append(cmd)
            return _fake_completed(returncode=0)

        with override_settings(JUDGE_BACKEND="container"):
            with mock.patch.object(
                checkers.subprocess, "run", side_effect=fake_checker_run
            ):
                verdict, _frac, _msg = self._run()
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        argv = seen_argv[0]
        self.assertEqual(argv[:2], ["docker", "exec"])
        self.assertIn("webcoder-judge-runner", argv)
        self.assertIn(str(self.dir), argv)
        self.assertNotIn("-v", argv)
        self.assertIn("checker.py", argv)


class CheckerProtocolV2Test(TestCase):
    """exit-code semantics + POINTS/MSG payload (D-J7 / JDG-4, testlib map)."""

    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self._td.name)
        self.addCleanup(self._td.cleanup)
        self.inp = self.dir / "input.txt"
        self.uout = self.dir / "user_output.txt"
        self.ans = self.dir / "answer.txt"
        for f in (self.inp, self.uout, self.ans):
            f.write_text("x")

    def _run(self, **kw):
        with mock.patch.object(
            checkers.subprocess, "run", return_value=_fake_completed(**kw)
        ):
            return run_custom_checker(
                "print('ok')", "python3", self.inp, self.uout, self.ans, self.dir
            )

    # --- exit-code mapping -------------------------------------------

    def test_exit0_full_credit_no_fraction(self):
        verdict, fraction, _ = self._run(returncode=0)
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertIsNone(fraction)

    def test_exit1_is_wrong_answer(self):
        verdict, fraction, msg = self._run(returncode=1)
        self.assertEqual(verdict, _VERDICT_WRONG_ANSWER)
        self.assertIsNone(fraction)
        self.assertIn("code 1", msg)

    def test_exit2_testlib_pe_maps_to_wrong_answer(self):
        verdict, fraction, msg = self._run(returncode=2)
        self.assertEqual(verdict, _VERDICT_WRONG_ANSWER)
        self.assertIsNone(fraction)
        self.assertIn("presentation error", msg)
        self.assertIn("mapped to WA", msg)

    def test_exit3_unexpected_is_internal_error_not_wa(self):
        verdict, fraction, msg = self._run(returncode=3)
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIsNone(fraction)
        self.assertIn("unexpected code 3", msg)

    # --- exit 7 + POINTS payload --------------------------------------

    def test_exit7_half_points_partial_award(self):
        verdict, fraction, msg = self._run(
            returncode=7, stdout="POINTS 0.5\nMSG almost there\n"
        )
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertEqual(fraction, 0.5)
        self.assertIn("50% of points", msg)
        self.assertIn("almost there", msg)

    def test_exit7_full_points_is_full_credit(self):
        verdict, fraction, _ = self._run(returncode=7, stdout="POINTS 1.0\n")
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertEqual(fraction, 1.0)

    def test_exit7_zero_points_is_wrong_answer(self):
        verdict, fraction, msg = self._run(
            returncode=7, stdout="POINTS 0\nMSG not close\n"
        )
        self.assertEqual(verdict, _VERDICT_WRONG_ANSWER)
        self.assertEqual(fraction, 0.0)
        self.assertIn("not close", msg)
        self.assertIn("zero points", msg)

    def test_exit7_missing_points_payload_is_ie(self):
        verdict, fraction, msg = self._run(returncode=7, stdout="hello\n")
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIsNone(fraction)
        self.assertIn("not 'POINTS <float>'", msg)

    def test_exit7_empty_stdout_is_ie(self):
        verdict, _, msg = self._run(returncode=7, stdout="")
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("empty stdout", msg)

    def test_exit7_non_numeric_points_is_ie(self):
        verdict, _, msg = self._run(returncode=7, stdout="POINTS abc\n")
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("not a number", msg)

    def test_exit7_out_of_range_points_is_ie(self):
        verdict, _, msg = self._run(returncode=7, stdout="POINTS 1.5\n")
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("out of range", msg)

    def test_exit7_negative_points_is_ie(self):
        verdict, _, msg = self._run(returncode=7, stdout="POINTS -0.1\n")
        self.assertEqual(verdict, _VERDICT_INTERNAL_ERROR)
        self.assertIn("out of range", msg)

    def test_exit7_leading_blank_lines_tolerated(self):
        verdict, fraction, _ = self._run(returncode=7, stdout="\n\nPOINTS 0.25\n\n")
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertEqual(fraction, 0.25)

    def test_exit7_msg_without_text_is_omitted(self):
        verdict, fraction, msg = self._run(returncode=7, stdout="POINTS 0.5\nMSG\n")
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertEqual(fraction, 0.5)
        self.assertNotIn("Checker message", msg)

    def test_exit7_second_line_not_msg_is_ignored(self):
        verdict, fraction, _ = self._run(
            returncode=7, stdout="POINTS 0.5\nSOMETHING ELSE\n"
        )
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertEqual(fraction, 0.5)

    # --- compile-once API ----------------------------------------------

    def test_compile_checker_unsupported_language(self):
        ok, msg, spec = checkers.compile_checker("code", "cobol", self.dir)
        self.assertFalse(ok)
        self.assertIn("Unsupported checker language", msg)
        self.assertIsNone(spec)

    def test_compile_checker_writes_source_and_returns_spec(self):
        ok, msg, spec = checkers.compile_checker("print('ok')", "python3", self.dir)
        self.assertTrue(ok)
        self.assertIsNotNone(spec)
        self.assertTrue((self.dir / "checker.py").exists())

    def test_compile_checker_compiles_through_run_compile_step(self):
        with mock.patch.object(
            checkers, "run_compile_step", return_value=(True, "ok")
        ) as compile_mock:
            ok, _msg, spec = checkers.compile_checker("int main(){}", "cpp17", self.dir)
        self.assertTrue(ok)
        self.assertIsNotNone(spec)
        self.assertEqual(compile_mock.call_count, 1)
        argv = compile_mock.call_args.args[0]
        self.assertIn("checker.cpp", argv)
        self.assertIn("checker_program", argv)

    def test_compile_checker_compile_failure(self):
        with mock.patch.object(
            checkers, "run_compile_step", return_value=(False, "syntax error")
        ):
            ok, msg, spec = checkers.compile_checker("bad", "cpp17", self.dir)
        self.assertFalse(ok)
        self.assertIn("compile failed", msg)
        self.assertIsNone(spec)

    def test_compile_checker_compile_exception(self):
        with mock.patch.object(
            checkers, "run_compile_step", side_effect=RuntimeError("boom")
        ):
            ok, msg, spec = checkers.compile_checker("x", "cpp17", self.dir)
        self.assertFalse(ok)
        self.assertIn("compile error", msg)

    def test_run_prepared_checker_accepts_precompiled_spec(self):
        ok, _msg, spec = checkers.compile_checker("print('ok')", "python3", self.dir)
        assert ok and spec is not None
        with mock.patch.object(
            checkers.subprocess, "run", return_value=_fake_completed(returncode=0)
        ) as run_mock:
            verdict, fraction, _ = checkers.run_prepared_checker(spec, self.dir)
        self.assertEqual((verdict, fraction), (_VERDICT_ACCEPTED, None))
        # The prepared run must NOT compile again — the call is a pure run.
        argv = run_mock.call_args.args[0]
        self.assertIn("input.txt", argv)

    def test_run_custom_checker_copies_evidence_files(self):
        self.inp.write_text("IN")
        with mock.patch.object(
            checkers.subprocess,
            "run",
            return_value=_fake_completed(returncode=0),
        ) as run_mock:
            verdict, _, _ = run_custom_checker(
                "print('ok')",
                "python3",
                self.inp,
                self.uout,
                self.ans,
                self.dir,
            )
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        # Evidence copied under the conventional names; originals intact.
        self.assertEqual((self.dir / "input.txt").read_text(), "IN")
        self.assertEqual(self.inp.read_text(), "IN")
        argv = run_mock.call_args.args[0]
        self.assertIn("input.txt", argv)

    def test_run_custom_checker_stages_external_evidence_files(self):
        # Evidence files living OUTSIDE the checker workspace (arbitrary
        # names) are staged under the conventional names before the run.
        with tempfile.TemporaryDirectory() as outside:
            ext_dir = pathlib.Path(outside)
            ext_in = ext_dir / "tc_input.txt"
            ext_out = ext_dir / "tc_user.txt"
            ext_ans = ext_dir / "tc_answer.txt"
            ext_in.write_text("EXT-IN")
            ext_out.write_text("EXT-OUT")
            ext_ans.write_text("EXT-ANS")
            with mock.patch.object(
                checkers.subprocess,
                "run",
                return_value=_fake_completed(returncode=0),
            ):
                verdict, _, _ = run_custom_checker(
                    "print('ok')",
                    "python3",
                    ext_in,
                    ext_out,
                    ext_ans,
                    self.dir,
                )
        self.assertEqual(verdict, _VERDICT_ACCEPTED)
        self.assertEqual((self.dir / "input.txt").read_text(), "EXT-IN")
        self.assertEqual((self.dir / "user_output.txt").read_text(), "EXT-OUT")
        self.assertEqual((self.dir / "answer.txt").read_text(), "EXT-ANS")
