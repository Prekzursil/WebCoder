"""Full line+branch coverage for judge_utils.compilation.compile_code_in_sandbox.

The Docker invocation (subprocess.run) is mocked so the suite is hermetic.
"""

import pathlib
import subprocess
import tempfile
from unittest import mock

from django.test import TestCase, override_settings

from submissions.judge_utils import compilation
from submissions.judge_utils.compilation import compile_code_in_sandbox


def _fake_completed(returncode=0, stdout="", stderr=""):
    return subprocess.CompletedProcess(
        args=["docker"], returncode=returncode, stdout=stdout, stderr=stderr
    )


class CompileCodeInSandboxTest(TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self._td.name)
        self.addCleanup(self._td.cleanup)

    def test_python_no_compilation(self):
        ok, out, path = compile_code_in_sandbox("print(1)", "python3", self.dir)
        self.assertTrue(ok)
        self.assertIn("no compilation", out)
        assert path is not None
        self.assertTrue(pathlib.Path(path).exists())

    def test_python_custom_libraries_none_defaults_to_empty(self):
        # custom_libraries_allowed=None path (the `is None` branch) for python.
        ok, _out, _path = compile_code_in_sandbox("print(1)", "python3", self.dir, None)
        self.assertTrue(ok)

    def test_cpp_success(self):
        def fake_run(cmd, *a, **k):
            # Simulate g++ producing the executable on the host.
            (self.dir / "user_program").write_text("bin")
            return _fake_completed(returncode=0, stdout="ok")

        with mock.patch.object(compilation.subprocess, "run", side_effect=fake_run):
            ok, out, path = compile_code_in_sandbox("int main(){}", "cpp17", self.dir)
        self.assertTrue(ok)
        self.assertIn("successful", out)
        assert path is not None
        self.assertTrue(path.endswith("user_program"))

    def test_cpp_failure_nonzero_return(self):
        with mock.patch.object(
            compilation.subprocess,
            "run",
            return_value=_fake_completed(returncode=1, stderr="err"),
        ):
            ok, out, path = compile_code_in_sandbox("bad", "cpp17", self.dir)
        self.assertFalse(ok)
        self.assertIsNone(path)
        self.assertIn("failed", out)

    def test_cpp_failure_returncode_zero_but_no_executable(self):
        # returncode 0 but the executable file does not exist -> else branch.
        with mock.patch.object(
            compilation.subprocess,
            "run",
            return_value=_fake_completed(returncode=0),
        ):
            ok, _out, path = compile_code_in_sandbox("x", "cpp17", self.dir)
        self.assertFalse(ok)
        self.assertIsNone(path)

    def test_cpp_timeout(self):
        with mock.patch.object(
            compilation.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired(cmd="docker", timeout=30),
        ):
            ok, out, path = compile_code_in_sandbox("x", "cpp17", self.dir)
        self.assertFalse(ok)
        self.assertIn("timed out", out)

    def test_cpp_docker_not_found(self):
        with mock.patch.object(
            compilation.subprocess, "run", side_effect=FileNotFoundError()
        ):
            ok, out, _ = compile_code_in_sandbox("x", "cpp17", self.dir)
        self.assertFalse(ok)
        self.assertIn("Docker command not found", out)

    def test_cpp_generic_exception(self):
        with mock.patch.object(
            compilation.subprocess, "run", side_effect=RuntimeError("kaboom")
        ):
            ok, out, _ = compile_code_in_sandbox("x", "cpp17", self.dir)
        self.assertFalse(ok)
        self.assertIn("system error", out)

    @override_settings(JUDGE_BOOST_HEADERS_PATH=None)
    def test_cpp_boost_requested_but_path_not_configured(self):
        with mock.patch.object(
            compilation.subprocess,
            "run",
            return_value=_fake_completed(returncode=1),
        ):
            ok, _out, _ = compile_code_in_sandbox(
                "x", "cpp17", self.dir, ["boost_headers"]
            )
        self.assertFalse(ok)

    def test_cpp_boost_requested_path_missing(self):
        with override_settings(
            JUDGE_BOOST_HEADERS_PATH=str(self.dir / "does_not_exist")
        ):
            with mock.patch.object(
                compilation.subprocess,
                "run",
                return_value=_fake_completed(returncode=1),
            ):
                ok, _out, _ = compile_code_in_sandbox(
                    "x", "cpp17", self.dir, ["boost_headers"]
                )
        self.assertFalse(ok)

    def test_cpp_boost_requested_path_exists_mounted(self):
        boost = self.dir / "boost"
        boost.mkdir()

        def fake_run(cmd, *a, **k):
            # boost path mounted into the command and -I flag inserted.
            self.assertIn(f"-I{compilation.CONTAINER_BOOST_INCLUDE_PATH}", cmd)
            (self.dir / "user_program").write_text("bin")
            return _fake_completed(returncode=0)

        with override_settings(JUDGE_BOOST_HEADERS_PATH=str(boost)):
            with mock.patch.object(compilation.subprocess, "run", side_effect=fake_run):
                ok, _out, _ = compile_code_in_sandbox(
                    "x", "cpp17", self.dir, ["boost_headers"]
                )
        self.assertTrue(ok)

    def test_java_success(self):
        def fake_run(cmd, *a, **k):
            (self.dir / "Main.class").write_text("bytecode")
            return _fake_completed(returncode=0)

        with mock.patch.object(compilation.subprocess, "run", side_effect=fake_run):
            ok, out, path = compile_code_in_sandbox("class Main{}", "java11", self.dir)
        self.assertTrue(ok)
        self.assertIn("successful", out)
        self.assertEqual(path, str(self.dir))

    def test_java_failure(self):
        with mock.patch.object(
            compilation.subprocess,
            "run",
            return_value=_fake_completed(returncode=1, stderr="javac error"),
        ):
            ok, out, path = compile_code_in_sandbox("bad", "java11", self.dir)
        self.assertFalse(ok)
        self.assertIsNone(path)
        self.assertIn("failed", out)

    def test_java_timeout(self):
        with mock.patch.object(
            compilation.subprocess,
            "run",
            side_effect=subprocess.TimeoutExpired(cmd="docker", timeout=30),
        ):
            ok, out, _ = compile_code_in_sandbox("x", "java11", self.dir)
        self.assertFalse(ok)
        self.assertIn("timed out", out)

    def test_java_docker_not_found(self):
        with mock.patch.object(
            compilation.subprocess, "run", side_effect=FileNotFoundError()
        ):
            ok, out, _ = compile_code_in_sandbox("x", "java11", self.dir)
        self.assertFalse(ok)
        self.assertIn("Docker command not found", out)

    def test_java_generic_exception(self):
        with mock.patch.object(
            compilation.subprocess, "run", side_effect=RuntimeError("kaboom")
        ):
            ok, out, _ = compile_code_in_sandbox("x", "java11", self.dir)
        self.assertFalse(ok)
        self.assertIn("system error", out)

    def test_unsupported_language(self):
        ok, out, path = compile_code_in_sandbox("x", "rust", self.dir)
        self.assertFalse(ok)
        self.assertIsNone(path)
        self.assertIn("Unsupported language", out)
