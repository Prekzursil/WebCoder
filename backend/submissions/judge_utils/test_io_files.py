"""Wave: language-fairness tests for the FILES-mode output readback
(execution.py) and the per-language compile budget (compilation.py).

The FILES readback is the fix for a live-stack-found bug: ``run_code_in_
sandbox`` documented that it reads the problem's output file back as the
run's answer, but never did — file-mode submissions compared an empty
stdout and read as WA. These tests exercise the real function with the
docker layer mocked at the subprocess boundary (the mocked runner writes
the files a real judged program would).
"""

import pathlib
import tempfile
import unittest
from unittest import mock

from submissions.judge_utils.compilation import run_compile_step
from submissions.judge_utils.execution import run_code_in_sandbox
from submissions.judge_utils.languages import LANGUAGES
from submissions.models import Submission


def _resource_line(user_s="0.01", sys_s="0.01", rss_kb=10240, exit_code=0):
    """A /usr/bin/time -f line matching TIME_FORMAT_STRING fields."""
    return f"{user_s} {sys_s} {rss_kb} {exit_code} 95.0% 0.02"


class _FakeCompleted:
    def __init__(self, stdout="", stderr="", returncode=0):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


class FilesModeReadbackTests(unittest.TestCase):
    """RO-4 FILES mode: the output FILE is the answer, not stdout."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.submission_dir = pathlib.Path(self.dir.name)
        (self.submission_dir / "user_code.py").write_text("print('x')\n")

    def tearDown(self):
        self.dir.cleanup()

    def _run(self, io_files=("date.in", "date.out")):
        return run_code_in_sandbox(
            str(self.submission_dir / "user_code.py"),
            "python3",
            "input-data",
            1000,
            262144,
            self.submission_dir,
            None,
            io_files=io_files,
        )

    def test_output_file_is_read_back_as_the_answer(self):
        def fake_runner(argv, **kwargs):
            # stdin must NOT receive the testcase input in FILES mode.
            assert kwargs.get("input") == ""
            (self.submission_dir / "date.out").write_text("file-answer\n")
            return _FakeCompleted(stdout="", stderr=_resource_line(), returncode=0)

        with mock.patch("subprocess.run", side_effect=fake_runner):
            verdict, _t, _m, output, _err = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(output, "file-answer\n")

    def test_missing_output_file_is_runtime_error_with_message(self):
        with mock.patch(
            "subprocess.run",
            return_value=_FakeCompleted(stdout="", stderr=_resource_line()),
        ):
            verdict, _t, _m, output, error = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        self.assertEqual(output, "")
        self.assertIn("did not create the required output file 'date.out'", error)

    def test_ole_cap_applies_to_file_output(self):
        from django.conf import settings

        def fake_runner(argv, **kwargs):
            (self.submission_dir / "date.out").write_text(
                "x" * (settings.JUDGE_OUTPUT_LIMIT_BYTES + 1)
            )
            return _FakeCompleted(stdout="", stderr=_resource_line())

        with mock.patch("subprocess.run", side_effect=fake_runner):
            verdict, _t, _m, _output, error = self._run()
        self.assertEqual(verdict, Submission.VerdictStatus.OUTPUT_LIMIT_EXCEEDED)
        self.assertIn("Output limit exceeded", error)

    def test_custom_output_filename_is_respected(self):
        def fake_runner(argv, **kwargs):
            (self.submission_dir / "pbinfo.out").write_text("42\n")
            return _FakeCompleted(stdout="", stderr=_resource_line())

        with mock.patch("subprocess.run", side_effect=fake_runner):
            verdict, _t, _m, output, _err = self._run(("pbinfo.in", "pbinfo.out"))
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(output, "42\n")


class CompileBudgetTests(unittest.TestCase):
    """Per-language compile deadlines (LanguageSpec.compile_timeout_s)."""

    def test_default_budget_is_30s(self):
        with mock.patch("subprocess.run", return_value=_FakeCompleted()) as run_mock:
            run_compile_step(["true"], pathlib.Path("."), "gcc:latest")
        argv = run_mock.call_args.args[0]
        self.assertIn("30s", argv)

    def test_slow_toolchain_budget_flows_into_timeout_argv(self):
        with mock.patch("subprocess.run", return_value=_FakeCompleted()) as run_mock:
            run_compile_step(
                ["kotlinc", "x.kt"],
                pathlib.Path("."),
                "zenika/kotlin:latest",
                timeout_s=LANGUAGES["kotlin"].compile_timeout_s,
            )
        argv = run_mock.call_args.args[0]
        self.assertIn("120s", argv)
