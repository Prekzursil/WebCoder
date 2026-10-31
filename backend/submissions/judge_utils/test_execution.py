"""Full line+branch coverage for judge_utils.execution.run_code_in_sandbox.

subprocess.run is mocked (hermetic). Local backend (settings default) uses
the per-run ``docker run``; container-mode tests override JUDGE_BACKEND.
"""

import pathlib
import subprocess
import tempfile
from unittest import mock

from django.test import TestCase, override_settings

from submissions.judge_utils import execution
from submissions.judge_utils.execution import run_code_in_sandbox
from submissions.models import Submission


def _fake_completed(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(
        args=["docker"], returncode=returncode, stdout=stdout, stderr=stderr
    )


# A well-formed /usr/bin/time -f "%U %S %M %x %P %e" resource line:
# user_cpu sys_cpu max_rss exit elapsed_pct wall
_RES = "0.01 0.00 2048 0 50% 0.02"


def _patch_run(**kw):
    return mock.patch.object(
        execution.subprocess, "run", return_value=_fake_completed(**kw)
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
        custom_libraries_allowed: list[str] | None = None,
    ):
        return run_code_in_sandbox(
            executable_path_str=executable_path_str or self.exe,
            language=language,
            input_data=input_data,
            time_limit_ms=time_limit_ms,
            memory_limit_kb=memory_limit_kb,
            submission_dir=self.dir,
            custom_libraries_allowed=custom_libraries_allowed,
        )

    def test_python_accepted_with_resource_line(self):
        with _patch_run(returncode=0, stdout="3\n", stderr=_RES):
            verdict, t, m, out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(out, "3\n")
        self.assertEqual(m, 2048)

    def test_python_local_backend_argv_contract(self):
        seen: dict = {}

        def fake_run(cmd, *a, **k):
            seen["argv"] = cmd
            seen["kwargs"] = k
            return _fake_completed(returncode=0, stderr=_RES)

        with mock.patch.object(execution.subprocess, "run", side_effect=fake_run):
            self._run()
        argv = seen["argv"]
        # Default (local) backend: per-run docker run, registry image,
        # read-only bind-mount of the workspace, resource harness + deadline.
        self.assertEqual(argv[:3], ["docker", "run", "--rm"])
        self.assertIn("python:3.11-slim", argv)
        self.assertIn(f"{self.dir.resolve()}:/app:ro", argv)
        self.assertIn("--memory", argv)
        self.assertIn("65536k", argv)
        self.assertIn(
            ["--network", "none"],
            [argv[i:i + 2] for i in range(len(argv) - 1)],
        )
        self.assertIn("timeout", argv)
        self.assertIn("/usr/bin/time", argv)
        self.assertIn("user_code.py", argv)
        # stdin piped with the test input, text mode.
        self.assertEqual(seen["kwargs"]["input"], "1 2")
        self.assertTrue(seen["kwargs"]["capture_output"])
        self.assertTrue(seen["kwargs"]["text"])

    def test_container_backend_execs_into_judge_runner(self):
        seen: dict = {}

        def fake_run(cmd, *a, **k):
            seen["argv"] = cmd
            return _fake_completed(returncode=0, stderr=_RES)

        with override_settings(JUDGE_BACKEND="container"):
            with mock.patch.object(
                execution.subprocess, "run", side_effect=fake_run
            ):
                verdict, *_ = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        argv = seen["argv"]
        # Production path: docker exec into the fixed judge-runner with the
        # workspace as workdir. No per-run container, no bind-mounts.
        self.assertEqual(argv[:2], ["docker", "exec"])
        self.assertIn("webcoder-judge-runner", argv)
        self.assertIn(str(self.dir), argv)
        self.assertNotIn("-v", argv)
        self.assertNotIn("--memory", argv)
        self.assertIn("timeout", argv)
        self.assertIn("/usr/bin/time", argv)

    def test_python_custom_libraries_none_default(self):
        # explicit None -> normalized to [] (the `is None` branch).
        with _patch_run(returncode=0, stderr=_RES):
            verdict, *_ = self._run(custom_libraries_allowed=None)
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_python_custom_libraries_run_is_sandboxed(self):
        # E1/J3 (SECURITY-AUDIT-judge J1 regression test): with custom libs
        # the judged run must stay fully sandboxed — read-only mount,
        # --network none, and NO pip in the run argv; the program is started
        # with PYTHONPATH pointing at the pre-installed libs dir only.
        noisy = "real error line\n" + _RES
        seen: dict = {}

        def fake_run(cmd, *a, **k):
            seen["argv"] = cmd
            seen["kwargs"] = k
            return _fake_completed(returncode=0, stdout="ok", stderr=noisy)

        with mock.patch.object(execution.subprocess, "run", side_effect=fake_run):
            verdict, _t, _m, _out, err = self._run(
                custom_libraries_allowed=["requests"]
            )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertIn("real error line", err)
        argv = seen["argv"]
        # Read-only submission mount, never rw.
        self.assertIn(f"{self.dir.resolve()}:/app:ro", argv)
        # Network isolation, never bridge.
        self.assertIn(
            ["--network", "none"],
            [argv[i:i + 2] for i in range(len(argv) - 1)],
        )
        # PYTHONPATH shim instead of an in-run pip install.
        sh_index = argv.index("sh")
        self.assertEqual(argv[sh_index + 1], "-c")
        self.assertIn("PYTHONPATH=libs", argv[sh_index + 2])
        self.assertIn("user_code.py", argv[sh_index + 2])
        pip_fragments = [a for a in argv if "pip" in str(a)]
        self.assertEqual(pip_fragments, [])
        # Standard communication window (no pip tail).
        self.assertEqual(seen["kwargs"]["timeout"], 4.0)
        # The requirements file is written by the install phase
        # (custom_libs.install_custom_libs), never by the judged run.
        self.assertFalse((self.dir / "requirements_custom.txt").exists())

    def test_stderr_without_resource_line(self):
        # stderr present but no line with parts[4] endswith '%' -> the
        # `if not resource_usage_line` branch sets all lines as program stderr.
        with _patch_run(returncode=1, stderr="plain error\nmore\n"):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        self.assertIn("plain error", err)

    def test_stderr_whitespace_only_no_lines(self):
        # stderr_data is truthy but strips to empty -> the inner `if lines:` is
        # false. returncode 0 -> ACCEPTED.
        with _patch_run(returncode=0, stdout="ok", stderr="   \n  "):
            verdict, *_ = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_resource_line_unparseable(self):
        # 6+ parts and parts[4] endswith '%', but parts[2] not an int -> the
        # ValueError/IndexError except branch (time_output_parsed stays False).
        bad = "x y notint 0 50% 0.02"
        with _patch_run(returncode=0, stdout="ok", stderr=bad):
            verdict, t, _m, _out, _err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(t, -1)

    def test_timeout_returncode_124(self):
        with _patch_run(returncode=124, stderr=_RES):
            verdict, t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.TIME_LIMIT_EXCEEDED)
        self.assertIn("Timeout", err)
        self.assertEqual(t, 1000)

    def test_cpu_tle_when_actual_exceeds_limit(self):
        # parsed user+sys cpu = (2.0+0.0)*1000 = 2000ms > 1000ms limit.
        res = "2.0 0.0 2048 0 50% 2.1"
        with _patch_run(returncode=0, stdout="ok", stderr=res):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.TIME_LIMIT_EXCEEDED)
        self.assertIn("CPU TLE", err)

    # --- Genuine MLE detection (SPEC-GAPS G10 / audit J2) ---------------
    def test_exit_137_is_mle_not_re(self):
        # OOM kill under the sandbox memory ceiling -> exit 137 -> MLE
        # (previously fell into RUNTIME_ERROR).
        with _patch_run(returncode=137, stderr=_RES):
            verdict, _t, m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.MEMORY_LIMIT_EXCEEDED)
        self.assertIn("exit code 137", err)
        self.assertIn("OOM", err)
        # Parsed peak RSS is preserved.
        self.assertEqual(m, 2048)

    def test_exit_negative_9_signal_is_mle(self):
        with _patch_run(returncode=-9, stderr=""):
            verdict, _t, m, _out, _err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.MEMORY_LIMIT_EXCEEDED)
        # No parseable RSS -> limit reported.
        self.assertEqual(m, 65536)

    def test_measured_rss_over_limit_is_mle(self):
        # Completed (exit 0) but measured peak RSS 409600 KB > 65536 KB limit.
        res = "0.01 0.00 409600 0 50% 0.02"
        with _patch_run(returncode=0, stdout="ok", stderr=res):
            verdict, _t, m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.MEMORY_LIMIT_EXCEEDED)
        self.assertEqual(m, 409600)
        self.assertIn("409600KB > 65536KB", err)

    def test_zero_memory_limit_disables_measured_mle_check(self):
        # memory_limit_kb <= 0 means "no per-problem cap": the measured-RSS
        # comparison must not trigger (docker also errors on --memory 0k, so
        # no --memory flag may be emitted).
        seen: dict = {}

        def fake_run(cmd, *a, **k):
            seen["argv"] = cmd
            return _fake_completed(
                returncode=0, stdout="ok", stderr="0.01 0.00 999999 0 50% 0.02"
            )

        with mock.patch.object(execution.subprocess, "run", side_effect=fake_run):
            verdict, *_ = self._run(memory_limit_kb=0)
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertNotIn("--memory", seen["argv"])

    def test_runtime_error_nonzero_no_resource_parsed(self):
        # returncode nonzero, no parsed time, stderr present, not pip error ->
        # the raw-stderr override branch.
        with _patch_run(returncode=2, stderr="segfault"):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        self.assertIn("Exit code: 2", err)

    def test_runtime_error_with_resource_parsed(self):
        # nonzero return BUT a resource line was parsed -> parsed_stderr branch.
        res = "0.01 0.00 1000 0 50% 0.02"
        with _patch_run(returncode=3, stdout="", stderr="boom\n" + res):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        self.assertIn("Exit code: 3", err)

    def test_python_pip_install_error_branch(self):
        # With pip moved out of the judged run, a failing program with
        # pip-flavored stderr is a plain RUNTIME_ERROR echoing the stderr
        # (install-phase errors are custom_libs' contract, covered by
        # test_custom_libs.py).
        pip_err = (
            "ERROR: Could not find a version that satisfies the requirement nope\n"
        )
        with _patch_run(returncode=1, stderr=pip_err):
            verdict, _t, _m, _out, err = self._run(custom_libraries_allowed=["nope"])
        self.assertEqual(verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        self.assertIn("Could not find a version", err)
        self.assertIn("Exit code: 1", err)

    def test_communicate_timeout_expired(self):
        with mock.patch.object(
            execution.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired(cmd="docker", timeout=4),
        ):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.TIME_LIMIT_EXCEEDED)
        self.assertIn("Communicate timeout", err)

    def test_communicate_timeout_standard_window_with_custom_libs(self):
        # E1/J3: pip no longer runs inside the judged run, so custom-libs
        # runs get the SAME communication window as every other run
        # (time limit + 3s), not the old +10s pip tail.
        seen: dict = {}

        def fake_run(cmd, *a, **k):
            seen["kwargs"] = k
            raise subprocess.TimeoutExpired(cmd="docker", timeout=4)

        with mock.patch.object(execution.subprocess, "run", side_effect=fake_run):
            verdict, _t, _m, _out, _err = self._run(
                custom_libraries_allowed=["requests"]
            )
        self.assertEqual(verdict, Submission.VerdictStatus.TIME_LIMIT_EXCEEDED)
        self.assertEqual(seen["kwargs"]["timeout"], 4.0)

    def test_docker_not_found(self):
        with mock.patch.object(
            execution.subprocess, "run", side_effect=FileNotFoundError()
        ):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.INTERNAL_ERROR)
        self.assertIn("Docker command not found", err)

    def test_generic_exception(self):
        with mock.patch.object(
            execution.subprocess, "run", side_effect=RuntimeError("boom")
        ):
            verdict, _t, _m, _out, err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.INTERNAL_ERROR)
        self.assertIn("Execution error", err)

    def test_time_limit_ms_zero_uses_default(self):
        # time_limit_ms <= 0 -> time_limit_ms floors to 1000.
        with _patch_run(returncode=0, stdout="ok", stderr=""):
            verdict, *_ = self._run(time_limit_ms=0)
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_cpp_language_accepted(self):
        with _patch_run(returncode=0, stdout="ok", stderr=_RES):
            verdict, *_ = self._run(
                language="cpp17", executable_path_str=str(self.dir / "user_program")
            )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_c11_runs_compiled_binary(self):
        seen: dict = {}

        def fake_run(cmd, *a, **k):
            seen["argv"] = cmd
            return _fake_completed(returncode=0, stdout="ok", stderr=_RES)

        with mock.patch.object(execution.subprocess, "run", side_effect=fake_run):
            verdict, *_ = self._run(
                language="c11", executable_path_str=str(self.dir / "user_program")
            )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertIn("./user_program", seen["argv"])

    def test_nodejs_runs_source(self):
        seen: dict = {}

        def fake_run(cmd, *a, **k):
            seen["argv"] = cmd
            return _fake_completed(returncode=0, stdout="ok", stderr=_RES)

        with mock.patch.object(execution.subprocess, "run", side_effect=fake_run):
            verdict, *_ = self._run(
                language="nodejs20",
                executable_path_str=str(self.dir / "user_code.js"),
            )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertIn("node", seen["argv"])
        self.assertIn("user_code.js", seen["argv"])

    def test_unsupported_language(self):
        verdict, t, m, out, err = self._run(language="cobol")
        self.assertEqual(verdict, Submission.VerdictStatus.INTERNAL_ERROR)
        self.assertIn("Unsupported language", err)

    # --- Java branches -------------------------------------------------
    def test_java_no_custom_libs(self):
        seen: dict = {}

        def fake_run(cmd, *a, **k):
            seen["argv"] = cmd
            return _fake_completed(returncode=0, stdout="ok", stderr=_RES)

        with mock.patch.object(execution.subprocess, "run", side_effect=fake_run):
            verdict, *_ = self._run(language="java11", executable_path_str=str(self.dir))
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(seen["argv"][-4:], ["java", "-cp", ".", "Main"])

    def test_java_libs_dir_not_configured(self):
        with override_settings(JUDGE_JAVA_LIBS_DIR_HOST=None):
            with _patch_run(returncode=0, stderr=_RES):
                verdict, *_ = self._run(
                    language="java11",
                    executable_path_str=str(self.dir),
                    custom_libraries_allowed=["lib.jar"],
                )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_java_libs_dir_missing(self):
        with override_settings(JUDGE_JAVA_LIBS_DIR_HOST=str(self.dir / "nope")):
            with _patch_run(returncode=0, stderr=_RES):
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
            with _patch_run(returncode=0, stderr=_RES):
                verdict, *_ = self._run(
                    language="java11",
                    executable_path_str=str(self.dir),
                    custom_libraries_allowed=["lib.jar"],
                )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)

    def test_java_libs_valid_dir_with_safe_and_unsafe_jars(self):
        libs = self.dir / "libs"
        libs.mkdir()
        seen: dict = {}

        def fake_run(cmd, *a, **k):
            seen["argv"] = cmd
            return _fake_completed(returncode=0, stdout="ok", stderr=_RES)

        with override_settings(JUDGE_JAVA_LIBS_DIR_HOST=str(libs)):
            with mock.patch.object(execution.subprocess, "run", side_effect=fake_run):
                verdict, *_ = self._run(
                    language="java11",
                    executable_path_str=str(self.dir),
                    # one safe jar + unsafe names (skipped via the filter)
                    custom_libraries_allowed=[
                        "ok.jar",
                        "../evil.jar",
                        "a/b.jar",
                        "c\\d.jar",
                        "colon:.jar",
                        "noext",
                    ],
                )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        cp = seen["argv"][seen["argv"].index("-cp") + 1]
        self.assertEqual(cp, f".:/app/host_java_libs/ok.jar")

    def test_java_libs_container_backend_skips_jars(self):
        # The exec path has no host mounts: JARs are skipped with a warning
        # and the classpath stays ".".
        seen: dict = {}

        def fake_run(cmd, *a, **k):
            seen["argv"] = cmd
            return _fake_completed(returncode=0, stdout="ok", stderr=_RES)

        libs = self.dir / "libs"
        libs.mkdir()
        with override_settings(
            JUDGE_BACKEND="container", JUDGE_JAVA_LIBS_DIR_HOST=str(libs)
        ):
            with mock.patch.object(execution.subprocess, "run", side_effect=fake_run):
                verdict, *_ = self._run(
                    language="java11",
                    executable_path_str=str(self.dir),
                    custom_libraries_allowed=["ok.jar"],
                )
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        cp = seen["argv"][seen["argv"].index("-cp") + 1]
        self.assertEqual(cp, ".")
        self.assertNotIn("-v", seen["argv"])

    # --- Removed verdict-forging triggers (audit J2 / SPEC-GAPS G10) ---
    # The tle_trigger/mle_trigger/re_trigger substring backdoors were
    # stripped from the production path; these tests pin their absence:
    # inputs containing the trigger strings must NOT alter verdicts.
    def test_tle_trigger_string_no_longer_forges_tle(self):
        with _patch_run(returncode=0, stdout="ok", stderr=_RES):
            verdict, _t, _m, out, err = self._run(input_data="tle_trigger")
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(out, "ok")
        self.assertNotIn("Simulated", err)

    def test_mle_trigger_string_no_longer_forges_mle(self):
        with _patch_run(returncode=0, stdout="ok", stderr=_RES):
            verdict, _t, _m, out, _err = self._run(input_data="mle_trigger")
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(out, "ok")

    def test_re_trigger_string_no_longer_forges_re(self):
        # The source-code re_trigger backdoor is gone entirely — the judge
        # no longer even receives the submission source on the run path.
        with _patch_run(returncode=0, stdout="ok", stderr=_RES):
            verdict, _t, _m, out, err = self._run(input_data="re_trigger")
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertNotIn("Simulated", err)


class SandboxTimeoutSignalTest(TestCase):
    """The wall-limit wrapper must keep the 124=TLE contract (live bug).

    coreutils 9.7 propagates the child's kill status when told
    ``--signal=SIGKILL`` (measured on the live judge-runner: exit 137, so
    every live CPU-TLE classified as MLE). The argv must therefore use
    the default TERM plus ``-k 1`` for the hard kill.
    """

    def test_argv_uses_term_plus_kill_after_not_sigkill(self):
        from .execution import run_code_in_sandbox  # noqa: F401  (import check)
        from .languages import get_language
        from . import execution as ex

        seen = {}

        class FakeResult:
            returncode = 0
            stdout = "0.01 0.01 8192 0 90% 0.05\nok"
            stderr = ""

        def fake_run(*args, **kwargs):
            seen["argv"] = args[0]
            seen["kwargs"] = kwargs
            return FakeResult()

        spec = get_language("python3")
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(
            ex.subprocess, "run", fake_run
        ):
            ex.run_code_in_sandbox(
                executable_path_str=str(spec.run_command[0]),
                language="python3",
                input_data="1 2",
                time_limit_ms=1000,
                memory_limit_kb=262144,
                submission_dir=pathlib.Path(tmp),
            )
        argv = seen["argv"]
        joined = " ".join(argv)
        self.assertNotIn("--signal=SIGKILL", joined)
        self.assertIn("-k", argv)
        self.assertEqual(argv[argv.index("-k") + 1], "1")
        i = argv.index("timeout")
        self.assertEqual(argv[i + 1], "-k")
