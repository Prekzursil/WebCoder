"""Tests for the settings-driven JUDGE_BACKEND switch (judge_utils/backend.py).

Deliberately plain ``unittest.TestCase`` classes: these are pure unit tests of
a settings-reading module and must NOT trigger pytest-django's test-database
setup (Django SimpleTestCase/TestCase classes do, which would make the suite
depend on a reachable PostgreSQL with matching credentials).
``override_settings`` is therefore used as a context manager, which works on
any test class.
"""

from django.test import TestCase
from submissions.models import Submission
from rest_framework.test import APIClient
from problems.models import Problem
from users.models import User
import pathlib
import subprocess
import sys
import unittest
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import override_settings

# Legacy judge flow must keep importing cleanly alongside the new backend
# switch (guard against the additive path breaking the existing flow).
from .judge_utils.compilation import compile_code_in_sandbox
from .judge_utils.execution import run_code_in_sandbox
from .judge_utils.checkers import run_custom_checker
from .judge_utils import backend as judge_backend
from .judge_utils.backend import (
    CONTAINER,
    JUDGE_RUNNER_CONTAINER,
    JUDGE_RUNNER_USER,
    LOCAL,
    build_command,
    get_judge_backend,
    run_judged_process,
)


class JudgeBackendSelectionTests(unittest.TestCase):
    """settings-driven JUDGE_BACKEND switch: selection + validation."""

    def test_default_backend_is_local(self):
        # Dev machines do not set JUDGE_BACKEND; settings.py defaults to "local".
        self.assertEqual(get_judge_backend(), LOCAL)

    def test_container_backend_selected(self):
        with override_settings(JUDGE_BACKEND="container"):
            self.assertEqual(get_judge_backend(), CONTAINER)

    def test_local_backend_selected(self):
        with override_settings(JUDGE_BACKEND="local"):
            self.assertEqual(get_judge_backend(), LOCAL)

    def test_invalid_backend_raises_improperly_configured(self):
        with override_settings(JUDGE_BACKEND="kubernetes"):
            with self.assertRaises(ImproperlyConfigured):
                get_judge_backend()

    def test_missing_setting_falls_back_to_local(self):
        # settings.JUDGE_BACKEND absent entirely -> getattr default "local".
        settings = judge_backend.settings
        had = hasattr(settings, "JUDGE_BACKEND")
        previous = getattr(settings, "JUDGE_BACKEND", None)
        if had:
            del settings.JUDGE_BACKEND
        try:
            self.assertEqual(get_judge_backend(), LOCAL)
        finally:
            if had:
                settings.JUDGE_BACKEND = previous


class BuildCommandTests(unittest.TestCase):
    """argv construction per backend."""

    def test_local_is_passthrough(self):
        cmd = ["python", "user_code.py"]
        self.assertEqual(build_command(cmd, backend=LOCAL), cmd)

    def test_local_used_when_setting_selected(self):
        with override_settings(JUDGE_BACKEND="local"):
            self.assertEqual(build_command(["g++", "a.cpp"]), ["g++", "a.cpp"])

    def test_container_wraps_in_hardened_docker_exec(self):
        argv = build_command(
            ["python", "user_code.py"],
            backend=CONTAINER,
            workdir="/srv/judge/submission_1",
        )
        self.assertEqual(argv[0], "docker")
        self.assertEqual(argv[1], "exec")
        self.assertIn("-i", argv)
        self.assertEqual(argv[argv.index("-w") + 1], "/srv/judge/submission_1")
        self.assertEqual(argv[argv.index("--user") + 1], JUDGE_RUNNER_USER)
        self.assertEqual(JUDGE_RUNNER_USER, "1000:1000")  # non-root, enforced
        # Target container from docker-compose.yml, then the judged command.
        self.assertEqual(argv[-3], JUDGE_RUNNER_CONTAINER)
        self.assertEqual(argv[-2:], ["python", "user_code.py"])

    def test_container_without_workdir_omits_w_flag(self):
        argv = build_command(["./user_program"], backend=CONTAINER)
        self.assertNotIn("-w", argv)
        self.assertEqual(argv[-2], JUDGE_RUNNER_CONTAINER)

    def test_container_used_when_setting_selected(self):
        with override_settings(JUDGE_BACKEND="container"):
            argv = build_command(["java", "-cp", "/app", "Main"])
        self.assertEqual(argv[0], "docker")

    def test_invalid_explicit_backend_raises(self):
        with self.assertRaises(ImproperlyConfigured):
            build_command(["true"], backend="vm")


class RunJudgedProcessLocalTests(unittest.TestCase):
    """LOCAL backend: real subprocess execution on the host (dev path)."""

    def test_runs_real_subprocess_and_captures_stdout(self):
        result = run_judged_process(
            [sys.executable, "-c", "print(21 * 2)"],
            backend=LOCAL,
            timeout=30,
        )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), "42")

    def test_stdin_input_is_piped_to_the_judged_process(self):
        result = run_judged_process(
            [
                sys.executable,
                "-c",
                "import sys; sys.stdout.write(sys.stdin.read().upper())",
            ],
            input_data="hello judge\n",
            backend=LOCAL,
            timeout=30,
        )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "HELLO JUDGE\n")

    def test_nonzero_exit_and_stderr_are_surfaced(self):
        result = run_judged_process(
            [
                sys.executable,
                "-c",
                "import sys; sys.stderr.write('boom'); sys.exit(3)",
            ],
            backend=LOCAL,
            timeout=30,
        )
        self.assertEqual(result.returncode, 3)
        self.assertIn("boom", result.stderr)

    def test_timeout_raises_timeout_expired(self):
        with self.assertRaises(subprocess.TimeoutExpired):
            run_judged_process(
                [sys.executable, "-c", "import time; time.sleep(10)"],
                backend=LOCAL,
                timeout=1,
            )


class RunJudgedProcessContainerTests(unittest.TestCase):
    """CONTAINER backend: docker exec argv contract (mocked — no Docker
    daemon needed; live-container behaviour is verified separately against
    the compose stack, see docker-compose.yml)."""

    def _run_mocked(self, **kwargs):
        with patch("submissions.judge_utils.backend.subprocess.run") as mock_run:
            mock_run.return_value = "completed-stub"
            result = run_judged_process(backend=CONTAINER, **kwargs)
        return result, mock_run

    def test_builds_hardened_docker_exec_argv_and_passes_io(self):
        result, mock_run = self._run_mocked(
            command=["python", "user_code.py"],
            input_data="1 2\n",
            timeout=7,
            cwd="/srv/judge/submission_9",
        )
        self.assertEqual(result, "completed-stub")
        mock_run.assert_called_once()
        (argv,), kwargs = mock_run.call_args
        self.assertEqual(
            argv,
            [
                "docker",
                "exec",
                "-i",
                "-w",
                "/srv/judge/submission_9",
                "--user",
                JUDGE_RUNNER_USER,
                JUDGE_RUNNER_CONTAINER,
                "python",
                "user_code.py",
            ],
        )
        self.assertEqual(kwargs["input"], "1 2\n")
        self.assertEqual(kwargs["timeout"], 7)
        self.assertTrue(kwargs["capture_output"])
        self.assertTrue(kwargs["text"])
        # Host cwd must NOT be forwarded: cwd names a path inside the container.
        self.assertIsNone(kwargs["cwd"])

    def test_host_cwd_not_leaked_as_host_cwd(self):
        _, mock_run = self._run_mocked(
            command=["./user_program"], cwd="/srv/judge/submission_2"
        )
        (argv,), kwargs = mock_run.call_args
        self.assertIsNone(kwargs["cwd"])
        # cwd appears exactly once, as the -w value (inside-container path).
        self.assertEqual(argv.count("/srv/judge/submission_2"), 1)
        self.assertEqual(argv[argv.index("-w") + 1], "/srv/judge/submission_2")

    def test_setting_drives_dispatch_without_explicit_backend(self):
        with override_settings(JUDGE_BACKEND="container"):
            with patch("submissions.judge_utils.backend.subprocess.run") as mock_run:
                mock_run.return_value = "ok"
                run_judged_process(["echo", "hi"])
        (argv,), _ = mock_run.call_args
        self.assertEqual(argv[:2], ["docker", "exec"])


class LegacyJudgeFlowUntouchedTests(unittest.TestCase):
    """The judge pipeline entrypoints keep their contracts, and the pipeline
    is now WIRED through the settings-driven backend (this used to assert
    the opposite — that the legacy modules ignored the backend switch; the
    container-backend IE bug (worker-local bind-mount paths) inverted that
    contract: backend.py is now THE spawn path for compilation.py /
    execution.py / checkers.py)."""

    def test_legacy_judge_entrypoints_still_importable(self):
        self.assertTrue(callable(compile_code_in_sandbox))
        self.assertTrue(callable(run_code_in_sandbox))
        self.assertTrue(callable(run_custom_checker))

    def test_judge_sources_dispatch_through_the_backend(self):
        # compilation.py / execution.py / checkers.py must build their spawns
        # via the backend switch — no private docker-run construction left.
        pkg_dir = pathlib.Path(__file__).parent / "judge_utils"
        for mod in ("compilation.py", "execution.py", "checkers.py"):
            source = (pkg_dir / mod).read_text(encoding="utf-8")
            self.assertIn("from .backend import", source, mod)
            for symbol in ("build_command", "build_docker_run_command"):
                self.assertIn(symbol, source, mod)

    def test_production_path_uses_docker_exec_not_bind_mounts(self):
        # Under JUDGE_BACKEND=container the argv must exec into the fixed
        # judge-runner; the broken per-run bind-mount flow must not appear.
        argv = build_command(
            ["python", "user_code.py"],
            backend=CONTAINER,
            workdir="/srv/judge/submission_1",
        )
        self.assertEqual(argv[:2], ["docker", "exec"])
        self.assertNotIn("-v", argv)
        self.assertNotIn("run", argv[:2])

    def test_verdict_forging_triggers_stripped_from_sources(self):
        # SECURITY-AUDIT-judge.md J2 / SPEC-GAPS G10: the tle_trigger /
        # mle_trigger / re_trigger substring backdoors must not exist in any
        # production judge module (they live on only in test fixtures).
        pkg_dir = pathlib.Path(__file__).parent / "judge_utils"
        for mod in (
            "compilation.py",
            "execution.py",
            "checkers.py",
            "backend.py",
            "languages.py",
        ):
            source = (pkg_dir / mod).read_text(encoding="utf-8")
            for trigger in ("tle_trigger", "mle_trigger", "re_trigger"):
                self.assertNotIn(trigger, source, f"{mod}: {trigger}")


class RuntimePercentileTest(TestCase):
    """Matrix row 61: the runtime percentile vs the community AC pool."""

    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
            author=self.user,
        )

    def _ac(self, ms, language="python3"):
        return Submission.objects.create(
            user=self.user,
            problem=self.problem,
            language=language,
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
            score=10,
            execution_time_ms=ms,
        )

    def test_percentile_of_fastest_submission(self):
        self._ac(100)
        self._ac(200)
        fastest = self._ac(50)
        client = APIClient()
        client.force_authenticate(self.user)
        resp = client.get(f"/api/v1/submissions/submissions/{fastest.id}/")
        self.assertEqual(resp.status_code, 200, resp.content)
        # Faster than both other ACs in the (inclusive) 3-run pool: 2/3.
        self.assertEqual(resp.json()["runtime_percentile"], 0.6667)

    def test_percentile_null_without_measured_time(self):
        sub = Submission.objects.create(
            user=self.user,
            problem=self.problem,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
            score=10,
        )
        client = APIClient()
        client.force_authenticate(self.user)
        resp = client.get(f"/api/v1/submissions/submissions/{sub.id}/")
        self.assertIsNone(resp.json()["runtime_percentile"])

    def test_percentile_scopes_to_problem_and_language(self):
        # A slow C++ AC on the same problem must not dilute a python run.
        self._ac(100, language="cpp17")
        py = self._ac(900, language="python3")
        client = APIClient()
        client.force_authenticate(self.user)
        resp = client.get(f"/api/v1/submissions/submissions/{py.id}/")
        # The only python AC -> faster than nobody: 0.0.
        self.assertEqual(resp.json()["runtime_percentile"], 0.0)

    def test_percentile_null_with_no_ac_pool(self):
        # A wrong-answer run carries a measured time but joins no pool:
        # total == 0 -> None (no comparison exists).
        sub = Submission.objects.create(
            user=self.user,
            problem=self.problem,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.WRONG_ANSWER,
            score=0,
            execution_time_ms=42,
        )
        client = APIClient()
        client.force_authenticate(self.user)
        resp = client.get(f"/api/v1/submissions/submissions/{sub.id}/")
        self.assertIsNone(resp.json()["runtime_percentile"])
