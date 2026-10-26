from typing import Any, Protocol, cast

from datetime import timedelta

from celery import shared_task
from django.utils import timezone
from django.db import transaction
from .models import Submission, SubmissionTestResult  # Import SubmissionTestResult
from problems.models import Problem, TestCase
import tempfile
import pathlib

from .judge_utils.backend import CONTAINER, get_judge_backend, judge_workspace_root
from .judge_utils.comparison import compare_outputs_detailed
from .judge_utils.compilation import compile_code_in_sandbox
from .judge_utils.languages import effective_limits
from .judge_utils.custom_libs import install_custom_libs
from .judge_utils.execution import run_code_in_sandbox
from .judge_utils.checkers import run_custom_checker
from leaderboard.aggregation import update_user_entry_task
from contests.scoring import record_verdict_task
from problems.scoring import aggregate_score
from notifications.models import Notification
from notifications.services import notify

#: Per-test captured outputs older than this many days are blanked by
#: :func:`prune_old_test_outputs` (storage hygiene, round-2 X3e).
RETENTION_DAYS = 90


def _judge_workspace(prefix: str) -> tempfile.TemporaryDirectory:
    """Create a per-run workspace visible to the judge backend.

    ``JUDGE_BACKEND=container`` (production): the workspace lives under
    ``settings.JUDGE_SANDBOX_ROOT`` (default ``/srv/judge``) — the shared
    judge-sandbox volume mounted at the SAME path in the Celery worker and
    the judge-runner container, so the ``docker exec`` path needs no host
    bind-mounts (the flaw that broke the legacy per-run ``docker run`` flow
    when the worker itself runs as a container).

    ``JUDGE_BACKEND=local`` (host dev): the system temp dir, bind-mounted
    per-run by ``docker run`` from the host.
    """
    if get_judge_backend() == CONTAINER:
        root = judge_workspace_root()
        root.mkdir(parents=True, exist_ok=True)
        return tempfile.TemporaryDirectory(prefix=prefix, dir=str(root))
    return tempfile.TemporaryDirectory(prefix=prefix)


def _notify_judged(submission, verdict):
    """Queue the SUBMISSION_JUDGED notification for after commit.

    Called at every terminal-verdict save (AC/WA/TLE/MLE/CE/RE/IE);
    intermediate COMPILING/RUNNING saves never call it.
    """
    transaction.on_commit(
        lambda: notify(
            submission.user,
            Notification.Verb.SUBMISSION_JUDGED,
            target=submission,
            data={
                "verdict": verdict,
                "problem_id": submission.problem_id,
                "submission_id": submission.id,
            },
        )
    )


class _CeleryTask(Protocol):
    """Minimal structural type for a Celery task.

    ``celery.shared_task`` is untyped in the type-check environment (celery
    ships no stubs there), so the decorator's return is opaque. Declaring this
    Protocol lets callers reference the task's async-dispatch API (``delay`` /
    ``apply_async``) without losing type checking on the rest of the module.
    """

    def delay(self, *args: Any, **kwargs: Any) -> Any: ...

    def apply_async(self, *args: Any, **kwargs: Any) -> Any: ...

    def __call__(self, *args: Any, **kwargs: Any) -> Any: ...


@shared_task(bind=True)
def judge_submission_task(self, submission_id):
    temp_dir_obj = None
    try:
        # Initial transaction to fetch problem and mark submission as COMPILING
        with transaction.atomic():
            submission = Submission.objects.select_for_update().get(id=submission_id)
            if submission.verdict != Submission.VerdictStatus.PENDING:
                return f"Submission {submission_id} not PENDING."
            problem = submission.problem
            test_cases = TestCase.objects.filter(problem=problem).order_by("order")
            submission.verdict = Submission.VerdictStatus.COMPILING
            submission.detailed_feedback = "Compiling..."
            submission.save()

        temp_dir_obj = _judge_workspace(f"submission_{submission_id}_")
        submission_dir = pathlib.Path(temp_dir_obj.name)

        compile_success, compiler_output, executable_path_str = compile_code_in_sandbox(
            submission.code,
            submission.language,
            submission_dir,
            problem.custom_libraries_allowed,
        )

        # Update submission status after compilation attempt
        with transaction.atomic():
            submission = Submission.objects.select_for_update().get(id=submission_id)
            if not compile_success:
                submission.verdict = Submission.VerdictStatus.COMPILE_ERROR
                submission.detailed_feedback = compiler_output
                submission.save()
                if submission.contest_id:
                    # CE still counts as an attempt on the contest board
                    # (penalty-free in the ICPC/AtCoder math — scoring.py).
                    transaction.on_commit(
                        lambda: record_verdict_task.delay(submission.id)
                    )
                _notify_judged(submission, submission.verdict)
                # temp_dir_obj is always created (above) before compilation, so
                # the falsey arm of this guard is unreachable here. Reasoned,
                # greppable pragma for the defensive cleanup guard.
                if temp_dir_obj:  # pragma: no cover
                    temp_dir_obj.cleanup()
                return f"Submission {submission_id}: Compile Error."

            submission.verdict = Submission.VerdictStatus.RUNNING
            submission.detailed_feedback = f"Compilation successful. Running test cases...\nCompiler Output:\n{compiler_output}"
            submission.save()

        # Custom-library install phase (SPEC-GAPS J3/E1): ONE pip container
        # per submission, BEFORE any judged run. Fail-closed egress by
        # default (JUDGE_PIP_NETWORK=none); the judged runs themselves stay
        # network-isolated either way (execution.py).
        if submission.language == "python3" and problem.custom_libraries_allowed:
            libs_ok, libs_message = install_custom_libs(
                submission_dir, problem.custom_libraries_allowed
            )
            if not libs_ok:
                with transaction.atomic():
                    submission = Submission.objects.select_for_update().get(
                        id=submission_id
                    )
                    submission.verdict = Submission.VerdictStatus.INTERNAL_ERROR
                    submission.detailed_feedback = (
                        "Custom library installation failed.\n" + libs_message
                    )
                    submission.save()
                    _notify_judged(submission, submission.verdict)
                if temp_dir_obj:
                    temp_dir_obj.cleanup()
                return f"Submission {submission_id}: library install failed."

        # J5: per-language effective limits — registry multipliers/floors,
        # explicit Problem.limit_overrides win over both.
        eff_time_ms, eff_mem_kb = effective_limits(
            problem.default_time_limit_ms,
            problem.default_memory_limit_kb,
            submission.language,
            problem.limit_overrides,
        )

        # RO-4: FILES-mode problems exchange data through working-directory
        # files instead of stdin/stdout.
        io_files = None
        if problem.io_mode == Problem.IOMode.FILES:
            io_files = (problem.io_input_filename, problem.io_output_filename)

        overall_verdict = Submission.VerdictStatus.ACCEPTED
        scored_results: list[tuple[TestCase, bool]] = []
        max_time_ms_overall = 0
        max_memory_kb_overall = 0

        for i, tc in enumerate(test_cases):
            if executable_path_str is None:
                overall_verdict = Submission.VerdictStatus.INTERNAL_ERROR
                SubmissionTestResult.objects.create(
                    submission=submission,
                    test_case=tc,
                    verdict=Submission.VerdictStatus.INTERNAL_ERROR,
                    error_output="Internal Error - Executable path missing after successful compile.",
                )
                break

            if io_files:
                (submission_dir / io_files[0]).write_text(
                    tc.input_data, encoding="utf-8"
                )
            tc_verdict, tc_time, tc_mem, tc_output, tc_error = run_code_in_sandbox(
                executable_path_str,
                submission.language,
                tc.input_data,
                eff_time_ms,
                eff_mem_kb,
                submission_dir,
                problem.custom_libraries_allowed,  # Pass custom libraries here as well
                io_files=io_files,
            )

            max_time_ms_overall = max(
                max_time_ms_overall, tc_time if tc_time is not None else 0
            )
            max_memory_kb_overall = max(
                max_memory_kb_overall, tc_mem if tc_mem is not None else 0
            )

            final_tc_verdict = tc_verdict
            if tc_verdict == Submission.VerdictStatus.ACCEPTED:
                if problem.comparison_mode == Problem.ComparisonMode.CUSTOM_CHECKER:
                    if problem.checker_code and problem.checker_language:
                        checker_temp_dir_obj_tc = _judge_workspace(
                            f"checker_{submission_id}_tc_{tc.id}_"
                        )
                        checker_dir_tc = pathlib.Path(checker_temp_dir_obj_tc.name)
                        input_file, user_output_file, answer_file = (
                            checker_dir_tc / "input.txt",
                            checker_dir_tc / "user_output.txt",
                            checker_dir_tc / "answer.txt",
                        )
                        with open(input_file, "w") as f:
                            f.write(tc.input_data)
                        with open(user_output_file, "w") as f:
                            f.write(tc_output)
                        with open(answer_file, "w") as f:
                            f.write(tc.expected_output_data)

                        checker_verdict_from_custom, checker_msg = run_custom_checker(
                            problem.checker_code,
                            problem.checker_language,
                            input_file,
                            user_output_file,
                            answer_file,
                            checker_dir_tc,
                        )
                        final_tc_verdict = checker_verdict_from_custom
                        tc_error = (
                            tc_error + "\n" if tc_error else ""
                        ) + f"Custom Checker Feedback:\n{checker_msg}"
                        checker_temp_dir_obj_tc.cleanup()
                    else:
                        final_tc_verdict = Submission.VerdictStatus.INTERNAL_ERROR
                        tc_error = (
                            tc_error + "\n" if tc_error else ""
                        ) + "Error: Custom checker selected but no checker code/lang."
                else:
                    outputs_match, mismatch_hint = compare_outputs_detailed(
                        tc_output,
                        tc.expected_output_data,
                        problem.comparison_mode,
                        problem.float_comparison_epsilon,
                        problem.case_insensitive,
                    )
                    if not outputs_match:
                        final_tc_verdict = Submission.VerdictStatus.WRONG_ANSWER
                        if mismatch_hint:
                            tc_error = (
                                (tc_error + "\n" if tc_error else "")
                                + mismatch_hint
                            )

            SubmissionTestResult.objects.create(
                submission=submission,
                test_case=tc,
                verdict=final_tc_verdict,
                execution_time_ms=tc_time if tc_time != -1 else None,
                memory_used_kb=tc_mem if tc_mem != -1 else None,
                actual_output=tc_output[:10000],
                error_output=tc_error[:10000],
            )

            scored_results.append((tc, final_tc_verdict == Submission.VerdictStatus.ACCEPTED))
            if final_tc_verdict != Submission.VerdictStatus.ACCEPTED:
                if overall_verdict == Submission.VerdictStatus.ACCEPTED:
                    overall_verdict = final_tc_verdict

        # J6: scoring-mode aggregation (partial per test / binary / subtasks)
        total_score, max_score = aggregate_score(problem.scoring_mode, scored_results)

        with transaction.atomic():
            submission = Submission.objects.select_for_update().get(id=submission_id)
            submission.verdict = overall_verdict
            submission.score = total_score
            submission.execution_time_ms = max_time_ms_overall
            submission.memory_used_kb = max_memory_kb_overall
            verdict_label = dict(Submission.VerdictStatus.choices).get(
                overall_verdict, overall_verdict
            )
            submission.detailed_feedback = (
                f"Overall Verdict: {verdict_label}. "
                f"Score: {total_score}"
                + (f"/{max_score}" if max_score else "")
                + "."
            )
            if compiler_output:
                submission.detailed_feedback = f"Compiler Output:\n{compiler_output}\n\n{submission.detailed_feedback}"
            submission.save()

            # Incremental leaderboard recompute (SPEC-GAPS D-B8): an AC on
            # an APPROVED problem may change this user's standings. Scheduled
            # on commit so a rolled-back transaction never emits the task;
            # recompute is idempotent so duplicate delivery is harmless.
            if overall_verdict == Submission.VerdictStatus.ACCEPTED:
                transaction.on_commit(
                    lambda: update_user_entry_task.delay(submission.user_id)
                )
            # Contest standings materialization (round-2 PRF-1): every
            # terminal verdict on a contest-bound submission folds into its
            # ContestScore row so scoreboard reads stay pure selects.
            if submission.contest_id:
                transaction.on_commit(
                    lambda: record_verdict_task.delay(submission.id)
                )
            _notify_judged(submission, overall_verdict)

        final_message = f"Submission {submission_id} judged. Verdict: {overall_verdict}"

    except Submission.DoesNotExist:
        final_message = f"Submission {submission_id} not found."
    except Exception as e:
        final_message = f"Judge internal error for sub {submission_id}."
        print(f"Critical error judging {submission_id}: {e}")
        try:
            with transaction.atomic():
                submission_obj = Submission.objects.select_for_update().get(
                    id=submission_id
                )
                submission_obj.verdict = Submission.VerdictStatus.INTERNAL_ERROR
                submission_obj.detailed_feedback = (
                    f"Judge system internal error: {str(e)}"
                )
                submission_obj.save()
                _notify_judged(submission_obj, submission_obj.verdict)
        except Exception as final_e:
            print(f"Failed to update sub {submission_id} to INTERNAL_ERROR: {final_e}")
    finally:
        if temp_dir_obj:
            temp_dir_obj.cleanup()
    return final_message


# ``shared_task`` is untyped here, so expose the task through the structural
# task type for callers that dispatch it asynchronously (e.g. ``.delay``).
# At runtime ``judge_submission_task`` is a bound Celery Task that provides
# these methods; the cast restores that interface for the type checker.
judge_task: _CeleryTask = cast(_CeleryTask, judge_submission_task)


@shared_task
def prune_old_test_outputs():
    """Storage hygiene (round-2 X3e): null per-test captured outputs older
    than RETENTION_DAYS. Verdicts, times and memory stay (they are small and
    load-bearing for history/stats); only the bulky ``actual_output`` /
    ``error_output`` blobs are dropped. Submission rows are never deleted.
    Daily beat scheduling lives in settings.CELERY_BEAT_SCHEDULE.
    """
    cutoff = timezone.now() - timedelta(days=RETENTION_DAYS)
    updated = SubmissionTestResult.objects.filter(
        submission__submission_time__lt=cutoff
    ).exclude(actual_output="", error_output="").update(
        actual_output="", error_output=""
    )
    return updated
