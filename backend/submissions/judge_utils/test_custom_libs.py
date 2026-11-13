"""Tests for judge_utils.custom_libs (SPEC-GAPS J3/E1) — the split pip
install phase and the requirement allowlist — plus the submit-time
serializer gate.

E1 regression contract (SECURITY-AUDIT-judge.md J1 / v1 G9): judged programs
must never run with network egress or a writable mount. The pip install
container is the ONLY judge-spawned container with any network at all, its
network defaults to ``none`` (fail closed), and its argv is asserted here.
"""

import pathlib
import subprocess
import tempfile
from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from problems.models import Problem
from submissions.judge_utils import custom_libs
from submissions.judge_utils.custom_libs import (
    install_custom_libs,
    is_allowed_requirement,
    validate_requirements,
)
from users.models import User


class AllowlistTest(TestCase):
    def test_accepted_specifiers(self):
        for entry in (
            "requests",
            "numpy",
            "scikit-learn",
            "django_filters",
            "numpy==1.26.4",
            "pkg==1.2.3rc1",
            "pkg==1!2.3",
        ):
            self.assertTrue(is_allowed_requirement(entry), entry)

    def test_rejected_specifiers(self):
        # VCS URLs, plain URLs, paths, editable installs, extras, version
        # ranges, options, and environment markers are all rejected — the
        # vectors SECURITY-AUDIT-judge J1 called out.
        for entry in (
            "git+https://attacker.example/x.git",
            "https://attacker.example/x.whl",
            "requests >= 2.0",
            "requests~=2.0",
            "requests>1,<3",
            "-e .",
            "./local/dir",
            "/etc/passwd",
            "requests[security]",
            "requests --index-url http://x",
            "requests; python_version >= '3'",
            "",
            "pkg==1.0 --hash=sha256:deadbeef",
        ):
            self.assertFalse(is_allowed_requirement(entry), entry)

    def test_validate_requirements_passthrough_and_error(self):
        self.assertEqual(validate_requirements(["a", "b==1.0"]), ["a", "b==1.0"])
        self.assertEqual(validate_requirements(None), [])
        with self.assertRaises(ValueError) as ctx:
            validate_requirements(["fine", "git+https://x/y"])
        self.assertIn("disallowed library specifier", str(ctx.exception))


class InstallCustomLibsTest(TestCase):
    def setUp(self):
        td = tempfile.TemporaryDirectory()
        self.addCleanup(td.cleanup)
        self.dir = pathlib.Path(td.name)

    def _install(self, libs, side_effect=None, return_value=None):
        with mock.patch.object(
            custom_libs.subprocess,
            "run",
            side_effect=side_effect,
            return_value=return_value,
        ) as run_mock:
            result = install_custom_libs(self.dir, libs)
        return result, (run_mock.call_args[0][0] if run_mock.call_count else None)

    def test_empty_libs_is_a_no_op(self):
        result, argv = self._install([])
        self.assertEqual(result, (True, ""))
        self.assertIsNone(argv)

    def test_allowlist_violation_fails_closed_without_docker(self):
        result, argv = self._install(["git+https://x/y"])
        self.assertFalse(result[0])
        self.assertIn("disallowed library specifier", result[1])
        self.assertIsNone(argv)

    def test_success_argv_contract_local_backend(self):
        ok = subprocess.CompletedProcess(
            args=["docker"],
            returncode=0,
            stdout="Successfully installed numpy",
            stderr="",
        )
        (success, out), argv = self._install(["numpy==1.26.4"], return_value=ok)
        self.assertTrue(success)
        self.assertIn("Successfully installed", out)
        # Requirements file written with the validated entries.
        self.assertEqual(
            (self.dir / "requirements_custom.txt").read_text(), "numpy==1.26.4\n"
        )
        # Fail-closed network by default + hardening + pip --target libs.
        self.assertIn("--network", argv)
        self.assertEqual(argv[argv.index("--network") + 1], "none")
        for flag in (
            "--rm",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--memory",
            "--pids-limit",
        ):
            self.assertIn(flag, argv)
        self.assertIn("--target=libs", argv)
        self.assertIn("python:3.11-slim", argv)
        # Writable bind exists ONLY in this install container.
        self.assertIn(f"{self.dir.resolve()}:{self.dir}:rw", argv)
        self.assertIn("-w", argv)

    @override_settings(
        JUDGE_PIP_NETWORK="judge-build",
        JUDGE_PYPI_INDEX_URL="http://pypi-proxy:8080/simple/",
    )
    def test_operator_provisioned_egress_is_env_gated(self):
        ok = subprocess.CompletedProcess(
            args=["docker"], returncode=0, stdout="", stderr=""
        )
        (success, _), argv = self._install(["numpy"], return_value=ok)
        self.assertTrue(success)
        self.assertEqual(argv[argv.index("--network") + 1], "judge-build")
        self.assertIn("-i", argv)
        self.assertEqual(argv[argv.index("-i") + 1], "http://pypi-proxy:8080/simple/")

    def test_pip_resolution_failure_message(self):
        bad = subprocess.CompletedProcess(
            args=["docker"],
            returncode=1,
            stdout="",
            stderr=(
                "ERROR: Could not find a version that satisfies the "
                "requirement nope (from versions: none)"
            ),
        )
        (success, msg), _ = self._install(["nope"], return_value=bad)
        self.assertFalse(success)
        self.assertIn("Python Library Install Error", msg)

    def test_no_egress_failure_message(self):
        bad = subprocess.CompletedProcess(
            args=["docker"],
            returncode=1,
            stdout="",
            stderr="pip: network unreachable --network none",
        )
        (success, msg), _ = self._install(["numpy"], return_value=bad)
        self.assertFalse(success)
        self.assertIn("no network egress", msg)

    def test_docker_missing_and_timeout(self):
        (success, msg), _ = self._install(["numpy"], side_effect=FileNotFoundError())
        self.assertFalse(success)
        self.assertIn("Docker command not found", msg)
        (success, msg), _ = self._install(
            ["numpy"], side_effect=subprocess.TimeoutExpired(cmd="docker", timeout=180)
        )
        self.assertFalse(success)
        self.assertIn("timed out", msg)

    @override_settings(JUDGE_BACKEND="container")
    def test_container_backend_without_volume_fails_closed(self):
        (success, msg), argv = self._install(["numpy"])
        self.assertFalse(success)
        self.assertIn("fails closed", msg)
        self.assertIsNone(argv)

    @override_settings(
        JUDGE_BACKEND="container",
        JUDGE_SANDBOX_VOLUME="webcoder_judge-sandbox",
        JUDGE_SANDBOX_ROOT="/srv/judge",
    )
    def test_container_backend_mounts_named_volume(self):
        ok = subprocess.CompletedProcess(
            args=["docker"], returncode=0, stdout="", stderr=""
        )
        (success, _), argv = self._install(["numpy"], return_value=ok)
        self.assertTrue(success)
        self.assertIn("webcoder_judge-sandbox:/srv/judge:rw", argv)


class SubmitTimeAllowlistGateTest(TestCase):
    """The serializer rejects hostile problem custom_libraries at 400."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="u2", password="pw")
        self.client.force_authenticate(user=self.user)

    def _problem(self, libs):
        return Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            comparison_mode=Problem.ComparisonMode.EXACT,
            custom_libraries_allowed=libs,
        )

    def test_hostile_requirement_rejected_with_400(self):
        problem = self._problem(["git+https://attacker.example/x.git"])
        response = self.client.post(
            "/api/v1/submissions/submit/",
            {"problem": problem.id, "language": "python3", "code": "print(1)"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("disallowed library specifier", str(response.data))

    def test_clean_requirement_accepted(self):
        problem = self._problem(["numpy==1.26.4"])
        with mock.patch("submissions.views.judge_task") as dispatch:
            response = self.client.post(
                "/api/v1/submissions/submit/",
                {"problem": problem.id, "language": "python3", "code": "print(1)"},
                format="json",
            )
        self.assertEqual(response.status_code, 201)
        dispatch.delay.assert_called_once()


class GenericInstallFailureTest(TestCase):
    def setUp(self):
        import pathlib
        import tempfile

        self.dir = pathlib.Path(tempfile.mkdtemp())

    def test_unrecognized_failure_message(self):
        bad = subprocess.CompletedProcess(
            args=["docker"], returncode=1, stdout="", stderr="disk quota exceeded"
        )
        (success, msg), _ = self._install(["numpy"], return_value=bad)
        self.assertFalse(success)
        self.assertIn("Custom library installation failed", msg)

    def _install(self, libs, side_effect=None, return_value=None):
        with mock.patch.object(
            custom_libs.subprocess,
            "run",
            side_effect=side_effect,
            return_value=return_value,
        ) as run_mock:
            result = install_custom_libs(self.dir, libs)
        return result, (run_mock.call_args[0][0] if run_mock.call_count else None)
