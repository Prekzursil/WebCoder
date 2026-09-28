"""Full line+branch coverage for judge_utils.execution.run_code_in_sandbox."""

import pathlib
import subprocess
import tempfile
from unittest import mock

from django.test import TestCase, override_settings

from submissions.judge_utils import execution
from submissions.judge_utils.execution import run_code_in_sandbox
from submissions.models import Submission


class _FakePopen:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr

    def communicate(self, input=None, timeout=None):  # noqa: A002
        return self._stdout, self._stderr


# A well-formed /usr/bin/time -f "%U %S %M %x %P %e" resource line:
# user_cpu sys_cpu max_rss exit elapsed_pct wall
_RES = "0.01 0.00 2048 0 50% 0.02"


def _patch_popen(**kw):
    return mock.patch.object(
        execution.subprocess, "Popen", return_value=_FakePopen(**kw)
    )


class RunCodeInSandboxTest(TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self._td.name)
        self.addCleanup(self._td.cleanup)
        self.exe = str(self.dir / "user_code.py")

    def _run(
        self,
        *,
        executable_path_str: str | None = None,
        language: str = "python3",
        input_data: str = "1 2",
        time_limit_ms: int = 1000,
        memory_limit_kb: int = 65536,
        source_code: str = "print(1)",
        custom_libraries_allowed: list[str] | None = None,
    ):
        return run_code_in_sandbox(
            executable_path_str=executable_path_str or self.exe,
            language=language,
            input_data=input_data,
            time_limit_ms=time_limit_ms,
            memory_limit_kb=memory_limit_kb,
            submission_dir=self.dir,
            source_code=source_code,
            custom_libraries_allowed=custom_libraries_allowed,
        )

    def test_python_accepted_with_resource_line(self):
        with _patch_popen(returncode=0, stdout="3\n", stderr=_RES):
            verdict, t, m, out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(out, "3\n")
        self.assertEqual(m, 2048)

    def test_python_custom_libraries_none_default(self):
        # explicit None -> normalized to [] (the `is None` branch).
        with _patch_popen(returncode=0, stderr=_RES):
            verdict, *_ = self._run(custom_libraries_allowed=None)
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_python_custom_libraries_enabled_filters_pip_noise(self):
        noisy = (
            "Collecting requests\n"
            "Installing collected packages: requests\n"
            "Successfully installed requests\n"
            "Requirement already satisfied: x\n"
            "Attempting to install custom Python libraries...\n"
            "Finished library installation attempt.\n"
            "WARNING: The script foo is installed in /x which is not on PATH.\n"
            "real error line\n" + _RES
        )
        with _patch_popen(returncode=0, stdout="ok", stderr=noisy):
            verdict, _t, _m, _out, err = self._run(
                custom_libraries_allowed=["requests"]
            )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertIn("real error line", err)
        self.assertNotIn("Collecting requests", err)
        self.assertTrue((self.dir / "requirements_custom.txt").exists())

    def test_stderr_without_resource_line(self):
        # stderr present but no line with parts[4] endswith '%' -> the
        # `if not resource_usage_line` branch sets all lines as program stderr.
        with _patch_popen(returncode=1, stderr="plain error\nmore\n"):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        self.assertIn("plain error", err)

    def test_stderr_whitespace_only_no_lines(self):
        # stderr_data is truthy but strips to empty -> the inner `if lines:` is
        # false (covers the 210->220 branch arm). returncode 0 -> ACCEPTED.
        with _patch_popen(returncode=0, stdout="ok", stderr="   \n  "):
            verdict, *_ = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_resource_line_unparseable(self):
        # 6+ parts and parts[4] endswith '%', but parts[2] not an int -> the
        # ValueError/IndexError except branch (time_output_parsed stays False).
        bad = "x y notint 0 50% 0.02"
        with _patch_popen(returncode=0, stdout="ok", stderr=bad):
            verdict, t, _m, _out, _err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(t, -1)

    def test_timeout_returncode_124(self):
        with _patch_popen(returncode=124, stderr=_RES):
            verdict, t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.TIME_LIMIT_EXCEEDED)
        self.assertIn("Timeout", err)
        self.assertEqual(t, 1000)

    def test_cpu_tle_when_actual_exceeds_limit(self):
        # parsed user+sys cpu = (2.0+0.0)*1000 = 2000ms > 1000ms limit.
        res = "2.0 0.0 2048 0 50% 2.1"
        with _patch_popen(returncode=0, stdout="ok", stderr=res):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.TIME_LIMIT_EXCEEDED)
        self.assertIn("CPU TLE", err)

    def test_runtime_error_nonzero_no_resource_parsed(self):
        # returncode nonzero, no parsed time, stderr present, not pip error ->
        # the `not time_output_parsed and stderr_data ...` override branch.
        with _patch_popen(returncode=2, stderr="segfault"):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        self.assertIn("Exit code: 2", err)

    def test_runtime_error_with_resource_parsed(self):
        # nonzero return BUT a resource line was parsed -> the else of the
        # last override (final_error already set from parsed_stderr branch).
        res = "0.01 0.00 1000 0 50% 0.02"
        with _patch_popen(returncode=3, stdout="", stderr="boom\n" + res):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        self.assertIn("Exit code: 3", err)

    def test_python_pip_install_error_branch(self):
        pip_err = (
            "ERROR: Could not find a version that satisfies the requirement nope\n"
        )
        with _patch_popen(returncode=1, stderr=pip_err):
            verdict, _t, _m, _out, err = self._run(custom_libraries_allowed=["nope"])
        self.assertEqual(verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        self.assertIn("Python Library Install Error", err)

    def test_communicate_timeout_expired(self):
        popen = _FakePopen()
        popen.communicate = mock.Mock(
            side_effect=subprocess.TimeoutExpired(cmd="docker", timeout=4)
        )
        with mock.patch.object(execution.subprocess, "Popen", return_value=popen):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.TIME_LIMIT_EXCEEDED)
        self.assertIn("Communicate timeout", err)

    def test_communicate_timeout_with_custom_libs_longer_window(self):
        popen = _FakePopen()
        popen.communicate = mock.Mock(
            side_effect=subprocess.TimeoutExpired(cmd="docker", timeout=11)
        )
        with mock.patch.object(execution.subprocess, "Popen", return_value=popen):
            verdict, _t, _m, _out, _err = self._run(
                custom_libraries_allowed=["requests"]
            )
        self.assertEqual(verdict, Submission.VerdictStatus.TIME_LIMIT_EXCEEDED)

    def test_docker_not_found(self):
        with mock.patch.object(
            execution.subprocess, "Popen", side_effect=FileNotFoundError()
        ):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.INTERNAL_ERROR)
        self.assertIn("Docker command not found", err)

    def test_generic_exception(self):
        with mock.patch.object(
            execution.subprocess, "Popen", side_effect=RuntimeError("boom")
        ):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.INTERNAL_ERROR)
        self.assertIn("Execution error", err)

    def test_time_limit_ms_zero_uses_default(self):
        # time_limit_ms <= 0 -> time_limit_s defaults to 1 (the conditional expr).
        # No resource line is emitted so no CPU-time comparison is triggered.
        with _patch_popen(returncode=0, stdout="ok", stderr=""):
            verdict, *_ = self._run(time_limit_ms=0)
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_cpp_language_accepted(self):
        with _patch_popen(returncode=0, stdout="ok", stderr=_RES):
            verdict, *_ = self._run(
                language="cpp17", executable_path_str=str(self.dir / "user_program")
            )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_unsupported_language(self):
        verdict, t, m, out, err = self._run(language="rust")
        self.assertEqual(verdict, Submission.VerdictStatus.INTERNAL_ERROR)
        self.assertIn("Unsupported language", err)

    # --- Java branches -------------------------------------------------
    def test_java_no_custom_libs(self):
        with _patch_popen(returncode=0, stdout="ok", stderr=_RES):
            verdict, *_ = self._run(
                language="java11", executable_path_str=str(self.dir)
            )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_java_libs_dir_not_configured(self):
        with override_settings(JUDGE_JAVA_LIBS_DIR_HOST=None):
            with _patch_popen(returncode=0, stderr=_RES):
                verdict, *_ = self._run(
                    language="java11",
                    executable_path_str=str(self.dir),
                    custom_libraries_allowed=["lib.jar"],
                )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_java_libs_dir_missing(self):
        with override_settings(JUDGE_JAVA_LIBS_DIR_HOST=str(self.dir / "nope")):
            with _patch_popen(returncode=0, stderr=_RES):
                verdict, *_ = self._run(
                    language="java11",
                    executable_path_str=str(self.dir),
                    custom_libraries_allowed=["lib.jar"],
                )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_java_libs_path_is_file_not_dir(self):
        f = self.dir / "afile"
        f.write_text("x")
        with override_settings(JUDGE_JAVA_LIBS_DIR_HOST=str(f)):
            with _patch_popen(returncode=0, stderr=_RES):
                verdict, *_ = self._run(
                    language="java11",
                    executable_path_str=str(self.dir),
                    custom_libraries_allowed=["lib.jar"],
                )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_java_libs_valid_dir_with_safe_and_unsafe_jars(self):
        libs = self.dir / "libs"
        libs.mkdir()
        with override_settings(JUDGE_JAVA_LIBS_DIR_HOST=str(libs)):
            with _patch_popen(returncode=0, stderr=_RES):
                verdict, *_ = self._run(
                    language="java11",
                    executable_path_str=str(self.dir),
                    # one safe jar + one unsafe (skipped via the continue branch)
                    custom_libraries_allowed=["ok.jar", "../evil.jar"],
                )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    # --- Post-process triggers ----------------------------------------
    def test_tle_trigger(self):
        with _patch_popen(returncode=0, stdout="ok", stderr=_RES):
            verdict, _t, _m, _out, err = self._run(input_data="tle_trigger")
        self.assertEqual(verdict, Submission.VerdictStatus.TIME_LIMIT_EXCEEDED)
        self.assertIn("Simulated TLE", err)

    def test_mle_trigger(self):
        with _patch_popen(returncode=0, stdout="ok", stderr=_RES):
            verdict, _t, _m, _out, err = self._run(input_data="mle_trigger")
        self.assertEqual(verdict, Submission.VerdictStatus.MEMORY_LIMIT_EXCEEDED)
        self.assertIn("Simulated MLE", err)

    def test_re_trigger(self):
        with _patch_popen(returncode=0, stdout="ok", stderr=_RES):
            verdict, _t, _out, _m, err = self._run(source_code="re_trigger()")
        self.assertEqual(verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        self.assertIn("Simulated RE", err)
