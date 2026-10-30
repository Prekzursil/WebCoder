"""Interactive problem judging (competitive roadmap JDG-2) — real pipe
wiring between two live processes.

The pair tests spawn REAL python processes (the crossed-pipe wiring IS the
feature); ``_wrap_command`` is patched to an identity function so no
Docker is needed — the wrapper construction itself is asserted separately
against the backend builders. The judge-task integration tests mock the
sandbox helpers the same way ``test_tasks.py`` does.
"""

import pathlib
import subprocess
import sys
import tempfile
import textwrap
from unittest import mock

from django.test import TestCase

from problems.models import Problem, TestCase as ProblemTestCase
from submissions.judge_utils import interactive
from submissions.judge_utils.interactive import (
    _parse_resource_line,
    compile_interactor,
    run_interactive_pair,
)
from submissions.judge_utils.languages import get_language
from submissions.models import Submission, SubmissionTestResult
from submissions.tasks import judge_submission_task
from users.models import User

#: Both sides of the pair are plain host python processes in these tests.
PY = sys.executable


def _user_script(body: str) -> list[str]:
    """A host ``python -c <script>`` user program."""
    return [PY, "-c", textwrap.dedent(body)]


class CompileInteractorTest(TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self._td.name)
        self.addCleanup(self._td.cleanup)

    def test_interpreter_language_compiles_without_a_step(self):
        ok, msg, spec = compile_interactor("print('hi')", "python3", self.dir)
        self.assertTrue(ok)
        self.assertIsNotNone(spec)
        self.assertEqual(spec.language_id, "python3")
        # The interactor source is written under its own namespace so a
        # checker in the same workspace can never collide.
        self.assertTrue((self.dir / "interactor.py").exists())

    def test_unsupported_language_rejected(self):
        ok, msg, spec = compile_interactor("code", "cobol", self.dir)
        self.assertFalse(ok)
        self.assertIsNone(spec)
        self.assertIn("Unsupported", msg)

    def test_java_rejected(self):
        ok, _msg, spec = compile_interactor("class M {}", "java11", self.dir)
        self.assertFalse(ok)
        self.assertIsNone(spec)

    def test_compiled_language_goes_through_run_compile_step(self):
        from submissions.judge_utils import checkers

        with mock.patch.object(
            checkers, "run_compile_step", return_value=(True, "ok")
        ) as step:
            ok, _msg, spec = compile_interactor("int main(){}", "cpp17", self.dir)
        self.assertTrue(ok)
        self.assertEqual(spec.language_id, "cpp17")
        # Retargeted names: interactor.cpp -> interactor_program.
        argv = step.call_args[0][0]
        self.assertIn("interactor.cpp", argv)
        self.assertIn("interactor_program", argv)

    def test_compile_failure_reported(self):
        from submissions.judge_utils import checkers

        with mock.patch.object(
            checkers, "run_compile_step", return_value=(False, "boom")
        ):
            ok, msg, spec = compile_interactor("int main(){}", "cpp17", self.dir)
        self.assertFalse(ok)
        self.assertIsNone(spec)
        self.assertIn("failed", msg)


class WrapCommandTest(TestCase):
    """Backend wrapping (construction only — no process is spawned)."""

    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self._td.name)
        self.addCleanup(self._td.cleanup)

    def test_container_backend_uses_docker_exec(self):
        with mock.patch.object(
            interactive, "get_judge_backend", return_value="container"
        ), mock.patch.object(
            interactive,
            "build_command",
            return_value=["docker", "exec", "SENTINEL"],
        ) as bc:
            argv = interactive._wrap_command(
                ["python", "x.py"],
                self.dir,
                "python:3.11-slim",
                262144,
                wall_cap_s=12.0,
                hard_timeout_s=12.0,
            )
        self.assertEqual(argv, ["docker", "exec", "SENTINEL"])
        bc.assert_called_once()
        # The workdir is handed to docker exec -w (inside the runner).
        self.assertEqual(bc.call_args[1]["workdir"], str(self.dir))

    def test_local_backend_uses_docker_run_with_image_and_limits(self):
        with mock.patch.object(
            interactive, "get_judge_backend", return_value="local"
        ), mock.patch.object(
            interactive,
            "build_docker_run_command",
            return_value=["docker", "run", "SENTINEL"],
        ) as br:
            argv = interactive._wrap_command(
                ["python", "x.py"],
                self.dir,
                "python:3.11-slim",
                262144,
                wall_cap_s=12.0,
                hard_timeout_s=12.0,
            )
        self.assertEqual(argv, ["docker", "run", "SENTINEL"])
        self.assertEqual(br.call_args[1]["docker_image"], "python:3.11-slim")
        self.assertEqual(br.call_args[1]["memory_limit_kb"], 262144)
        self.assertTrue(br.call_args[1]["interactive"])


class InteractorRunArgvTest(TestCase):
    def test_interpreted_spec_appends_evidence_files(self):
        argv = interactive._interactor_run_argv(get_language("python3"))
        self.assertEqual(
            argv, ["python", "interactor.py", "input.txt", "answer.txt"]
        )

    def test_compiled_spec_retargets_artifact(self):
        argv = interactive._interactor_run_argv(get_language("cpp17"))
        self.assertEqual(
            argv, ["./interactor_program", "input.txt", "answer.txt"]
        )


class WrapCommandPosixPrefixTest(TestCase):
    """POSIX hosts prefix the in-container timeout + /usr/bin/time harness.

    Both directions are exercised via the os.name patch so the branch is
    fully covered on Windows AND Linux CI runners (the natural value only
    ever covers one side per platform).
    """

    def test_posix_prefix_added(self):
        # The Path must be constructed BEFORE patching os.name — on
        # Windows hosts pathlib picks the flavour at instantiation time.
        workdir = pathlib.Path(".")
        with mock.patch.object(
            interactive.os, "name", "posix"
        ), mock.patch.object(
            interactive, "get_judge_backend", return_value="local"
        ), mock.patch.object(
            interactive,
            "build_docker_run_command",
            return_value=["docker", "run", "SENTINEL"],
        ) as br:
            interactive._wrap_command(
                ["python", "x.py"],
                workdir,
                "python:3.11-slim",
                262144,
                wall_cap_s=12.0,
                hard_timeout_s=12.0,
            )
        wrapped = br.call_args[0][0]
        self.assertEqual(wrapped[:3], ["timeout", "--signal=SIGKILL", "12s"])
        self.assertIn("/usr/bin/time", wrapped)

    def test_non_posix_host_runs_the_bare_argv(self):
        workdir = pathlib.Path(".")
        with mock.patch.object(
            interactive.os, "name", "nt"
        ), mock.patch.object(
            interactive, "get_judge_backend", return_value="local"
        ), mock.patch.object(
            interactive,
            "build_docker_run_command",
            return_value=["docker", "run", "SENTINEL"],
        ) as br:
            interactive._wrap_command(
                ["python", "x.py"],
                workdir,
                "python:3.11-slim",
                262144,
                wall_cap_s=12.0,
                hard_timeout_s=12.0,
            )
        wrapped = br.call_args[0][0]
        # No timeout//usr/bin/time prefixes on non-POSIX dev hosts — the
        # bare argv runs and resource measurement degrades to zero.
        self.assertNotIn("timeout", wrapped)
        self.assertNotIn("/usr/bin/time", wrapped)


class KillPairTest(TestCase):
    def test_none_processes_are_skipped(self):
        interactive._kill_pair(None, None)  # must not raise

    def test_dead_process_kill_is_swallowed(self):
        class Dead:
            def kill(self):
                raise OSError("already dead")

        interactive._kill_pair(Dead(), Dead())  # must not raise


class ParseResourceLineTest(TestCase):
    def test_parses_time_format_line(self):
        stderr = "debug noise\n 0.10 0.02 51200 0 100.0% 0.13"
        self.assertEqual(_parse_resource_line(stderr), (120, 51200))

    def test_missing_line_returns_zero(self):
        self.assertEqual(_parse_resource_line("nothing here"), (0, 0))

    def test_garbage_line_returns_zero(self):
        self.assertEqual(_parse_resource_line("a b c d e% f g"), (0, 0))

    def test_negative_numbers_are_not_parsed(self):
        # A line that parses as floats but not as the time format (no %
        # field) must not crash the parser.
        self.assertEqual(_parse_resource_line("1 2 3 4 5 6 7"), (0, 0))


class RunInteractivePairTest(TestCase):
    """Real crossed-pipe runs between two live python processes.

    ``_wrap_command`` is the identity (bare host argv, no docker, no
    /usr/bin/time prefixes), so resource measurement degrades to zero and
    the resource-override branches are covered by patching the parser.
    """

    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self._td.name)
        self.addCleanup(self._td.cleanup)
        patcher = mock.patch.object(
            interactive, "_wrap_command", side_effect=lambda argv, *a, **k: list(argv)
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.int_spec = get_language("python3")
        self.int_script = self.dir / "interactor.py"

    def _run(self, user_body: str, interactor_body: str, **overrides):
        self.int_script.write_text(textwrap.dedent(interactor_body), encoding="utf-8")
        (self.dir / "input.txt").write_text("q 42\n", encoding="utf-8")
        (self.dir / "answer.txt").write_text("42\n", encoding="utf-8")
        with mock.patch.object(
            interactive,
            "_interactor_run_argv",
            return_value=[PY, str(self.int_script)],
        ):
            return run_interactive_pair(
                _user_script(user_body),
                "python3",
                self.dir,
                self.int_spec,
                self.dir,
                overrides.pop("time_limit_ms", 1000),
                overrides.pop("memory_limit_kb", 262144),
                **overrides,
            )

    def test_accepted_when_interactor_approves(self):
        verdict, t_ms, mem_kb, frac, feedback = self._run(
            user_body="print(42)",
            interactor_body="""
            import sys
            line = sys.stdin.readline().strip()
            if line == '42':
                sys.exit(0)
            sys.exit(1)
            """,
        )
        self.assertEqual(verdict, "AC")
        self.assertIsNone(frac)
        self.assertIn("Interactor STDERR", feedback)

    def test_wrong_answer_exit_1(self):
        verdict, _t, _m, frac, feedback = self._run(
            user_body="print(41)",
            interactor_body="import sys\nsys.exit(1)",
        )
        self.assertEqual(verdict, "WA")
        self.assertIsNone(frac)
        self.assertIn("failure (code 1)", feedback)

    def test_presentation_error_exit_2_maps_to_wa(self):
        verdict, *_ = self._run(
            user_body="print(1)",
            interactor_body="import sys\nsys.exit(2)",
        )
        self.assertEqual(verdict, "WA")

    def test_partial_exit_7_reads_points_from_stderr(self):
        verdict, _t, _m, frac, feedback = self._run(
            user_body="print(7)",
            interactor_body="""
            import sys
            sys.stderr.write('POINTS 0.5\\n')
            sys.stderr.write('MSG half right\\n')
            sys.exit(7)
            """,
        )
        self.assertEqual(verdict, "AC")
        self.assertEqual(frac, 0.5)
        self.assertIn("half right", feedback)

    def test_partial_exit_7_without_msg_line(self):
        verdict, _t, _m, frac, feedback = self._run(
            user_body="print(7)",
            interactor_body="""
            import sys
            sys.stderr.write('POINTS 0.3\\n')
            sys.exit(7)
            """,
        )
        self.assertEqual(verdict, "AC")
        self.assertEqual(frac, 0.3)
        self.assertNotIn("Interactor message", feedback)

    def test_malformed_points_payload_is_ie(self):
        verdict, _t, _m, frac, feedback = self._run(
            user_body="print(7)",
            interactor_body="""
            import sys
            sys.stderr.write('POINTS notanumber\\n')
            sys.exit(7)
            """,
        )
        self.assertEqual(verdict, "IE")
        self.assertIsNone(frac)
        self.assertIn("Invalid interactor partial-points payload", feedback)

    def test_out_of_range_points_payload_is_ie(self):
        verdict, *_ = self._run(
            user_body="print(7)",
            interactor_body="""
            import sys
            sys.stderr.write('POINTS 2.0\\n')
            sys.exit(7)
            """,
        )
        self.assertEqual(verdict, "IE")

    def test_zero_points_partial_is_wa(self):
        verdict, _t, _m, frac, _fb = self._run(
            user_body="print(7)",
            interactor_body="""
            import sys
            sys.stderr.write('POINTS 0.0\\n')
            sys.exit(7)
            """,
        )
        self.assertEqual(verdict, "WA")
        self.assertEqual(frac, 0.0)

    def test_unexpected_interactor_exit_is_ie(self):
        verdict, _t, _m, _frac, feedback = self._run(
            user_body="print(1)",
            interactor_body="import sys\nsys.exit(5)",
        )
        self.assertEqual(verdict, "IE")
        self.assertIn("unexpected code 5", feedback)

    def test_interactor_timeout_exit_is_ie(self):
        verdict, _t, _m, _frac, feedback = self._run(
            user_body="print(1)",
            # Exit 124 = the in-container timeout wrapper's code; an
            # interactor that burns its own envelope is a judge-side bug.
            interactor_body="import sys\nsys.exit(124)",
        )
        self.assertEqual(verdict, "IE")
        self.assertIn("Interactor timed out", feedback)

    def test_deadlocked_pair_is_wall_tle(self):
        # Both sides block forever; the pair watchdog must fire. The
        # wall-cap floor is patched down so the test stays fast.
        with mock.patch.object(interactive, "WALL_CAP_MIN_S", 0.2):
            verdict, _t, _m, frac, feedback = self._run(
                user_body="import time\ntime.sleep(60)",
                interactor_body="import sys\nsys.stdin.read()",
            )
        self.assertEqual(verdict, "TLE")
        self.assertIsNone(frac)
        self.assertIn("wall-clock cap", feedback)

    def test_user_lingering_after_interactor_is_killed_verdict_stands(self):
        # Interactor finishes instantly; the submission keeps sleeping and
        # gets killed after the (patched-down) grace — AC stands.
        with mock.patch.object(interactive, "POST_INTERACTOR_GRACE_S", 0.2):
            verdict, _t, _m, _frac, feedback = self._run(
                user_body="import time\ntime.sleep(30)",
                interactor_body="import sys\nsys.exit(0)",
            )
        self.assertEqual(verdict, "AC")
        self.assertIn("interactor verdict stands", feedback)

    def test_nonzero_user_exit_after_conversation_is_reported_not_fatal(self):
        verdict, _t, _m, _frac, feedback = self._run(
            user_body="import sys\nsys.stdin.read()\nsys.exit(3)",
            interactor_body="import sys\nsys.exit(0)",
        )
        self.assertEqual(verdict, "AC")
        self.assertIn("exited with code", feedback)

    def test_user_wall_timeout_exit_maps_to_tle(self):
        # The inner ``timeout`` wrapper reports 124 — the submission hung.
        verdict, _t, _m, _frac, feedback = self._run(
            user_body="import sys\nsys.stdin.read()\nsys.exit(124)",
            interactor_body="import sys\nsys.exit(0)",
        )
        self.assertEqual(verdict, "TLE")
        self.assertIn("wall-clock timeout", feedback)

    def test_measured_cpu_over_limit_overrides_interactor_ac(self):
        with mock.patch.object(
            interactive, "_parse_resource_line", return_value=(5000, 100)
        ):
            verdict, _t, _m, _frac, feedback = self._run(
                user_body="print(1)",
                interactor_body="import sys\nsys.exit(0)",
                time_limit_ms=1000,
            )
        self.assertEqual(verdict, "TLE")
        self.assertIn("CPU", feedback)

    def test_measured_memory_over_limit_overrides_interactor_ac(self):
        with mock.patch.object(
            interactive, "_parse_resource_line", return_value=(10, 999_999)
        ):
            verdict, _t, _m, _frac, feedback = self._run(
                user_body="print(1)",
                interactor_body="import sys\nsys.exit(0)",
                memory_limit_kb=262144,
            )
        self.assertEqual(verdict, "MLE")
        self.assertIn("memory", feedback)

    def test_missing_command_is_ie(self):
        with mock.patch.object(
            interactive,
            "_wrap_command",
            side_effect=FileNotFoundError("no docker"),
        ):
            verdict, _t, _m, _frac, feedback = run_interactive_pair(
                [PY, "-c", "print(1)"],
                "python3",
                self.dir,
                self.int_spec,
                self.dir,
                1000,
                262144,
            )
        self.assertEqual(verdict, "IE")
        self.assertIn("not found", feedback)

    def test_spawn_oserror_is_ie(self):
        with mock.patch.object(
            interactive,
            "_wrap_command",
            side_effect=OSError("boom"),
        ):
            verdict, _t, _m, _frac, feedback = run_interactive_pair(
                [PY, "-c", "print(1)"],
                "python3",
                self.dir,
                self.int_spec,
                self.dir,
                1000,
                262144,
            )
        self.assertEqual(verdict, "IE")
        self.assertIn("Failed to spawn", feedback)


class JudgeTaskInteractiveTest(TestCase):
    """judge_submission_task orchestration for INTERACTIVE problems."""

    def setUp(self):
        self.user = User.objects.create_user(username="iu", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "Guess"},
            statement_i18n={"en": "Guess the number."},
            problem_type=Problem.ProblemType.INTERACTIVE,
            interactor_code="import sys\nsys.exit(0)",
            interactor_language="python3",
        )
        self.tc = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="2\n",
            expected_output_data="2\n",
            points=10,
            order=1,
        )

    def _sub(self, code="print(2)"):
        return Submission.objects.create(
            user=self.user, problem=self.problem, language="python3", code=code
        )

    def _call(self, submission_id):
        return judge_submission_task.run(submission_id)  # type: ignore[attr-defined]

    def test_interactive_ac_skips_batch_run(self):
        sub = self._sub()
        with (
            mock.patch(
                "submissions.tasks.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                "submissions.tasks.compile_interactor",
                return_value=(True, "ok", get_language("python3")),
            ) as ci,
            mock.patch(
                "submissions.tasks.run_interactive_pair",
                return_value=("AC", 12, 2048, None, "conversation ok"),
            ) as pair,
            mock.patch("submissions.tasks.run_code_in_sandbox") as batch,
        ):
            msg = self._call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(sub.score, 10)
        self.assertIn("judged", msg)
        ci.assert_called_once()
        pair.assert_called_once()
        batch.assert_not_called()
        row = SubmissionTestResult.objects.get(submission=sub)
        self.assertEqual(row.verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertIn("conversation ok", row.error_output)

    def test_interactive_partial_awards_fraction(self):
        sub = self._sub()
        with (
            mock.patch(
                "submissions.tasks.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                "submissions.tasks.compile_interactor",
                return_value=(True, "ok", get_language("python3")),
            ),
            mock.patch(
                "submissions.tasks.run_interactive_pair",
                return_value=("AC", 12, 2048, 0.5, "half"),
            ),
        ):
            self._call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(sub.score, 5)

    def test_interactive_wa_propagates(self):
        sub = self._sub()
        with (
            mock.patch(
                "submissions.tasks.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                "submissions.tasks.compile_interactor",
                return_value=(True, "ok", get_language("python3")),
            ),
            mock.patch(
                "submissions.tasks.run_interactive_pair",
                return_value=("WA", 5, 1024, None, "no"),
            ),
        ):
            msg = self._call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.WRONG_ANSWER)
        self.assertEqual(sub.score, 0)

    def test_second_failing_test_keeps_first_verdict(self):
        # Two failing tests: the second failure must not overwrite the
        # first overall verdict (the `overall != AC` guard).
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="3\n",
            expected_output_data="3\n",
            points=10,
            order=2,
        )
        sub = self._sub()
        with (
            mock.patch(
                "submissions.tasks.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                "submissions.tasks.compile_interactor",
                return_value=(True, "ok", get_language("python3")),
            ),
            mock.patch(
                "submissions.tasks.run_interactive_pair",
                side_effect=[
                    ("WA", 5, 1024, None, "first"),
                    ("TLE", 9, 1024, None, "second"),
                ],
            ) as pair,
        ):
            self._call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.WRONG_ANSWER)
        self.assertEqual(pair.call_count, 2)
        self.assertEqual(SubmissionTestResult.objects.count(), 2)

    def test_interactor_compile_failure_is_ie(self):
        sub = self._sub()
        with (
            mock.patch(
                "submissions.tasks.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                "submissions.tasks.compile_interactor",
                return_value=(False, "bad interactor", None),
            ),
            mock.patch("submissions.tasks.run_interactive_pair") as pair,
        ):
            msg = self._call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.INTERNAL_ERROR)
        self.assertIn("bad interactor", sub.detailed_feedback)
        self.assertIn("interactor compile failed", msg)
        pair.assert_not_called()

    def test_missing_interactor_fields_per_test_ie(self):
        self.problem.interactor_code = ""
        self.problem.interactor_language = ""
        self.problem.save()
        sub = self._sub()
        with (
            mock.patch(
                "submissions.tasks.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch("submissions.tasks.run_interactive_pair") as pair,
        ):
            msg = self._call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.INTERNAL_ERROR)
        row = SubmissionTestResult.objects.get(submission=sub)
        self.assertIn("without interactor", row.error_output)
        pair.assert_not_called()

    def test_interactive_ignores_files_io_mode(self):
        # An author error (FILES + INTERACTIVE) must not pre-write io
        # files or break the pair flow — the interactive branch owns the
        # per-test loop before the FILES branch.
        self.problem.io_mode = Problem.IOMode.FILES
        self.problem.save()
        sub = self._sub()
        with (
            mock.patch(
                "submissions.tasks.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                "submissions.tasks.compile_interactor",
                return_value=(True, "ok", get_language("python3")),
            ),
            mock.patch(
                "submissions.tasks.run_interactive_pair",
                return_value=("AC", 3, 512, None, "ok"),
            ),
        ):
            self._call(sub.id)
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.ACCEPTED)


class InteractiveSerializerTest(TestCase):
    """Authoring-time validation of the INTERACTIVE cross-field rule."""

    def setUp(self):
        self.author = User.objects.create_user(
            username="author", password="p", role=User.Roles.PROBLEM_CREATOR
        )

    def _payload(self, **overrides):
        base = {
            "title_i18n": {"en": "T", "ro": "T"},
            "statement_i18n": {"en": "S", "ro": "S"},
            "problem_type": "INTERACTIVE",
            "interactor_code": "import sys\nsys.exit(0)",
            "interactor_language": "python3",
        }
        base.update(overrides)
        return base

    def test_interactive_requires_interactor_fields(self):
        from problems.serializers import ProblemSerializer
        from rest_framework import serializers as drf_serializers

        serializer = ProblemSerializer(
            data=self._payload(interactor_code="", interactor_language=""),
            context={"request": None},
        )
        with self.assertRaises(drf_serializers.ValidationError):
            serializer.is_valid(raise_exception=True)

    def test_interactive_missing_language_only_also_rejected(self):
        from problems.serializers import ProblemSerializer
        from rest_framework import serializers as drf_serializers

        serializer = ProblemSerializer(
            data=self._payload(interactor_language=""),
            context={"request": None},
        )
        with self.assertRaises(drf_serializers.ValidationError):
            serializer.is_valid(raise_exception=True)

    def test_interactive_with_fields_is_valid(self):
        from problems.serializers import ProblemSerializer

        serializer = ProblemSerializer(
            data=self._payload(), context={"request": None}
        )
        self.assertTrue(serializer.is_valid())

    def test_normal_problem_needs_no_interactor(self):
        from problems.serializers import ProblemSerializer

        serializer = ProblemSerializer(
            data=self._payload(problem_type="NORMAL"),
            context={"request": None},
        )
        self.assertTrue(serializer.is_valid())

    def test_partial_update_keeps_existing_interactor(self):
        # PATCHing an existing INTERACTIVE problem without re-sending the
        # interactor fields must not trip the cross-field rule (the
        # instance already carries them).
        from problems.serializers import ProblemSerializer

        problem = Problem.objects.create(
            title_i18n={"en": "T"},
            statement_i18n={"en": "S"},
            problem_type=Problem.ProblemType.INTERACTIVE,
            interactor_code="x",
            interactor_language="python3",
            author=self.author,
        )
        serializer = ProblemSerializer(
            problem, data={"default_time_limit_ms": 2000}, partial=True
        )
        self.assertTrue(serializer.is_valid())

    def test_existing_interactive_stripped_on_update_rejected(self):
        from problems.serializers import ProblemSerializer
        from rest_framework import serializers as drf_serializers

        problem = Problem.objects.create(
            title_i18n={"en": "T"},
            statement_i18n={"en": "S"},
            problem_type=Problem.ProblemType.INTERACTIVE,
            interactor_code="x",
            interactor_language="python3",
            author=self.author,
        )
        serializer = ProblemSerializer(
            problem, data={"interactor_code": ""}, partial=True
        )
        with self.assertRaises(drf_serializers.ValidationError):
            serializer.is_valid(raise_exception=True)
