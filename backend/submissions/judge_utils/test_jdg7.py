"""JDG-7 mapped runtime-error feedback + OLE (competitive roadmap Wave B).

Signal-killed runs map to actionable messages (SIGSEGV/SIGFPE/...); output
past the judge cap reads as OLE — the single biggest debuggability gap
between judges.
"""

import pathlib
import tempfile
from unittest import mock

from django.test import TestCase

from submissions.judge_utils import execution
from submissions.judge_utils.execution import run_code_in_sandbox, signal_feedback
from submissions.models import Submission

_RES = "0.01 0.00 2048 0 50% 0.02"


class SignalFeedbackTest(TestCase):
    def test_maps_all_documented_signals(self):
        # docker-style 128+sig, host-style -sig, and bare sig all normalize.
        self.assertIn("Segmentation fault", signal_feedback(139))
        self.assertIn("Segmentation fault", signal_feedback(-11))
        self.assertIn("Floating point exception", signal_feedback(136))
        self.assertIn("Aborted", signal_feedback(-6))
        self.assertIn("Illegal instruction", signal_feedback(132))

    def test_unmapped_and_zero(self):
        self.assertIsNone(signal_feedback(1))
        self.assertIsNone(signal_feedback(0))
        self.assertIsNone(signal_feedback(42))


class MappedREAndOLETest(TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self._td.name)
        self.addCleanup(self._td.cleanup)

    def _run(self, **kw):
        fake = mock.Mock(
            returncode=kw.get("returncode", 0),
            stdout=kw.get("stdout", ""),
            stderr=kw.get("stderr", _RES),
        )
        with mock.patch.object(execution.subprocess, "run", return_value=fake):
            return run_code_in_sandbox(
                executable_path_str=str(self.dir / "user_code.py"),
                language="python3",
                input_data="1",
                time_limit_ms=1000,
                memory_limit_kb=65536,
                submission_dir=self.dir,
            )

    def test_sigsegv_exit_139_maps_to_actionable_message(self):
        verdict, _t, _m, _o, err = self._run(returncode=139)
        self.assertEqual(verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        self.assertIn("Segmentation fault", err)
        self.assertIn("exit code 139", err)

    def test_sigfpe_negative_8_maps_to_division_message(self):
        verdict, _t, _m, _o, err = self._run(returncode=-8)
        self.assertEqual(verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        self.assertIn("Floating point exception", err)

    def test_unmapped_signal_keeps_generic_message(self):
        # 3 = SIGQUIT mapped? no — unmapped on purpose (keep 133 for SIGTRAP).
        verdict, _t, _m, _o, err = self._run(returncode=3)
        self.assertEqual(verdict, Submission.VerdictStatus.RUNTIME_ERROR)
        self.assertIn("Exit code: 3", err)
        self.assertNotIn("Segmentation", err)

    def test_oversized_output_is_ole_not_ac(self):
        # 33 MB of output > the 32 MB default cap (settings_ci inherits it).
        verdict, _t, _m, _o, err = self._run(stdout="x" * 33_000_001)
        self.assertEqual(verdict, Submission.VerdictStatus.OUTPUT_LIMIT_EXCEEDED)
        self.assertIn("Output limit exceeded", err)

    def test_normal_output_under_cap_still_ac(self):
        verdict, _t, _m, output, _err = self._run(stdout="answer", returncode=0)
        self.assertEqual(verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(output, "answer")
