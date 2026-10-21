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
        seen_argv: list[list[str]] = []

        def fake_run(cmd, *a, **k):
            seen_argv.append(cmd)
            (self.dir / "Main.class").write_text("bytecode")
            return _fake_completed(returncode=0)

        with mock.patch.object(compilation.subprocess, "run", side_effect=fake_run):
            ok, out, path = compile_code_in_sandbox("class Main{}", "java11", self.dir)
        self.assertTrue(ok)
        self.assertIn("successful", out)
        # java11 must compile with --release 11 (SPEC drift fix: the
        # judge-runner toolchain is OpenJDK 21; without --release the id
        # "java11" would be a lie).
        self.assertIn("--release", seen_argv[0])
        self.assertIn("11", seen_argv[0])
        # Registry contract: the executable is the produced artifact.
        self.assertEqual(path, str(self.dir / "Main.class"))

    def test_c11_success(self):
        def fake_run(cmd, *a, **k):
            (self.dir / "user_program").write_text("bin")
            return _fake_completed(returncode=0)

        with mock.patch.object(compilation.subprocess, "run", side_effect=fake_run):
            ok, out, path = compile_code_in_sandbox("int main(){}", "c11", self.dir)
        self.assertTrue(ok)
        self.assertIn("successful", out)
        assert path is not None
        self.assertTrue(path.endswith("user_program"))

    def test_c11_uses_gcc_with_c11_standard(self):
        seen_argv: list[list[str]] = []

        def fake_run(cmd, *a, **k):
            seen_argv.append(cmd)
            (self.dir / "user_program").write_text("bin")
            return _fake_completed(returncode=0)

        with mock.patch.object(compilation.subprocess, "run", side_effect=fake_run):
            compile_code_in_sandbox("int main(){}", "c11", self.dir)
        argv = seen_argv[0]
        self.assertIn("gcc", argv)
        self.assertIn("-std=c11", argv)
        self.assertIn("user_code.c", argv)

    def test_nodejs_no_compilation(self):
        ok, out, path = compile_code_in_sandbox("console.log(1)", "nodejs20", self.dir)
        self.assertTrue(ok)
        self.assertIn("no compilation", out)
        assert path is not None
        self.assertTrue(str(path).endswith("user_code.js"))

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

    # --- Backend dispatch ----------------------------------------------
    def test_container_backend_execs_into_judge_runner(self):
        from django.test import override_settings

        seen_argv: list[list[str]] = []

        def fake_run(cmd, *a, **k):
            seen_argv.append(cmd)
            (self.dir / "user_program").write_text("bin")
            return _fake_completed(returncode=0)

        with override_settings(JUDGE_BACKEND="container"):
            with mock.patch.object(
                compilation.subprocess, "run", side_effect=fake_run
            ):
                ok, _out, _path = compile_code_in_sandbox(
                    "int main(){}", "cpp17", self.dir
                )
        self.assertTrue(ok)
        argv = seen_argv[0]
        # Production path: docker exec into the fixed judge-runner container,
        # working dir = the submission workspace on the shared volume. No
        # per-run `docker run`, no bind-mounts.
        self.assertEqual(argv[:2], ["docker", "exec"])
        self.assertIn("webcoder-judge-runner", argv)
        self.assertIn(str(self.dir), argv)
        self.assertNotIn("run", argv[:2])
        self.assertNotIn("-v", argv)
        # In-container compile deadline wraps the compiler.
        self.assertIn("timeout", argv)
        self.assertIn("g++", argv)

    def test_local_backend_uses_per_run_docker_run(self):
        # Default settings backend is "local": per-run docker run with a
        # bind-mount and the registry image.
        seen_argv: list[list[str]] = []

        def fake_run(cmd, *a, **k):
            seen_argv.append(cmd)
            (self.dir / "user_program").write_text("bin")
            return _fake_completed(returncode=0)

        with mock.patch.object(compilation.subprocess, "run", side_effect=fake_run):
            ok, _out, _path = compile_code_in_sandbox("int main(){}", "cpp17", self.dir)
        self.assertTrue(ok)
        argv = seen_argv[0]
        self.assertEqual(argv[:3], ["docker", "run", "--rm"])
        self.assertIn("gcc:latest", argv)
        self.assertIn(
            f"{self.dir.resolve()}:/app:ro", argv
        )

    def test_container_backend_boost_warns_and_compiles_without_mount(self):
        from django.test import override_settings

        boost = self.dir / "boost"
        boost.mkdir()
        seen_argv: list[list[str]] = []

        def fake_run(cmd, *a, **k):
            seen_argv.append(cmd)
            (self.dir / "user_program").write_text("bin")
            return _fake_completed(returncode=0)

        with override_settings(
            JUDGE_BACKEND="container", JUDGE_BOOST_HEADERS_PATH=str(boost)
        ):
            with mock.patch.object(
                compilation.subprocess, "run", side_effect=fake_run
            ):
                ok, _out, _path = compile_code_in_sandbox(
                    "int main(){}", "cpp17", self.dir, ["boost_headers"]
                )
        self.assertTrue(ok)
        # No host bind-mounts are possible on the exec path.
        self.assertNotIn("-v", seen_argv[0])
        self.assertNotIn(
            f"-I{compilation.CONTAINER_BOOST_INCLUDE_PATH}", seen_argv[0]
        )
