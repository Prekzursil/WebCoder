"""Run a problem's custom checker program against one test case.

Checker protocol v2 (SPEC-GAPS J7 / competitive roadmap JDG-4) —
testlib-compatible:

=====  ===========================  =============================
exit   meaning (testlib analogue)   judged as
=====  ===========================  =============================
0      OK (_ok)                     AC, full points
1      wrong answer (_wa)           WA
2      presentation error (_pe)     WA (no separate PE verdict)
7      partial points (_points)     stdout must lead with
                                     ``POINTS <float 0..1>`` and may
                                     continue with ``MSG <text>``;
                                     the fraction scales the test's
                                     points (PARTIAL_PER_TEST mode)
other  checker crash / bad exit     IE (INTERNAL_ERROR)
=====  ===========================  =============================

A malformed, missing, or out-of-range ``POINTS`` payload on exit 7 is IE,
never a silent zero — verifiers must hear about broken checkers.

Compilation is hoisted out of the per-test loop: :func:`compile_checker`
prepares the artifact once per submission and :func:`run_prepared_checker`
executes it per test case. :func:`run_custom_checker` remains as the
one-shot composition (compile + single run) for callers that do not loop.

Checker languages are registry-driven
(:mod:`submissions.judge_utils.languages`): any non-Java registry language
works as a checker (the checker source is written under the spec's file
name, optionally compiled with the spec's toolchain, and run with the three
evidence files as argv). Java is excluded because its run argv is a fixed
class name, not a program file.

Spawning goes through the configured judge backend
(:mod:`submissions.judge_utils.backend`) — ``docker exec`` into the hardened
judge-runner (production) or a per-run ``docker run`` (local host dev) — via
the shared compile step in :mod:`submissions.judge_utils.compilation`.
"""

import pathlib
import re
import shutil
import subprocess

from ..models import Submission  # For Submission.VerdictStatus
from .backend import (
    CONTAINER,
    build_command,
    build_docker_run_command,
    get_judge_backend,
)
from .compilation import run_compile_step
from .languages import LanguageSpec, get_language

# Verdict values as plain strings. Submission.VerdictStatus members are str
# subclasses at runtime (str(member) yields the value, e.g. "IE"), so these are
# interchangeable with the enum members in comparisons and DB writes, while
# remaining typed as ``str`` for the checker's return contract.
_VERDICT_INTERNAL_ERROR: str = str(Submission.VerdictStatus.INTERNAL_ERROR)
_VERDICT_ACCEPTED: str = str(Submission.VerdictStatus.ACCEPTED)
_VERDICT_WRONG_ANSWER: str = str(Submission.VerdictStatus.WRONG_ANSWER)

#: Fixed resource envelope for checker runs.
CHECKER_TIME_LIMIT_S = 10
CHECKER_MEM_LIMIT_KB = 262144

#: Checker evidence files (written into the checker workspace per test).
CHECKER_INPUT_FILE = "input.txt"
CHECKER_USER_OUTPUT_FILE = "user_output.txt"
CHECKER_ANSWER_FILE = "answer.txt"

#: Basename for checker sources/artifacts (extension comes from the spec).
CHECKER_SOURCE_BASENAME = "checker"
CHECKER_ARTIFACT_NAME = "checker_program"

#: testlib exit codes this protocol understands.
_EXIT_OK = 0
_EXIT_WRONG_ANSWER = 1
_EXIT_PRESENTATION_ERROR = 2
_EXIT_PARTIAL = 7

_POINTS_RE = re.compile(r"^POINTS\s+(\S+)$")
_MSG_RE = re.compile(r"^MSG\s+(.*)$")


def compile_checker(
    checker_code: str,
    checker_language: str,
    workspace_dir: pathlib.Path,
) -> tuple[bool, str, LanguageSpec | None]:
    """Write and compile the checker ONCE per submission (J7).

    Returns ``(ok, message, spec)``. On success ``spec`` is the language
    spec the caller passes back to :func:`run_prepared_checker` per test;
    on failure ``spec`` is None and ``message`` explains why.
    """
    spec = get_language(checker_language)
    if spec is None or spec.language_id == "java11":
        return (
            False,
            f"Unsupported checker language: {checker_language}",
            None,
        )

    source_suffix = pathlib.Path(spec.source_filename).suffix
    checker_source_name = CHECKER_SOURCE_BASENAME + source_suffix
    checker_source_file = workspace_dir / checker_source_name
    with open(checker_source_file, "w") as f:
        f.write(checker_code)

    if spec.compile_command is not None:
        try:
            compile_argv = list(
                spec.compile_argv(
                    source_name=checker_source_name,
                    artifact_name=CHECKER_ARTIFACT_NAME,
                )
                or ()
            )
            compile_ok, compiler_out = run_compile_step(
                compile_argv,
                workdir=workspace_dir,
                docker_image=spec.docker_image,
            )
        except Exception as e:  # defensive: run_compile_step fails closed itself
            return False, f"Checker compile error: {str(e)}", None
        if not compile_ok:
            return False, f"Checker compile failed.\n{compiler_out}", None

    return True, "Checker ready.", spec


def parse_points_payload(stdout: str) -> tuple[float | None, str | None, str | None]:
    """Parse an exit-7 stdout payload.

    Returns ``(fraction, msg, error)`` — exactly one of ``fraction`` /
    ``error`` is set. The payload must lead (after optional blank lines)
    with ``POINTS <float 0..1>``; an optional second line ``MSG <text>``
    carries the checker's human feedback.
    """
    lines = [line for line in stdout.splitlines() if line.strip()]
    if not lines:
        return (
            None,
            None,
            "exit 7 with empty stdout: expected 'POINTS <float 0..1>'",
        )
    match = _POINTS_RE.match(lines[0].strip())
    if not match:
        return (
            None,
            None,
            f"exit 7 first stdout line is not 'POINTS <float>': {lines[0]!r}",
        )
    try:
        fraction = float(match.group(1))
    except ValueError:
        return None, None, f"POINTS payload is not a number: {match.group(1)!r}"
    if not 0.0 <= fraction <= 1.0:
        return (
            None,
            None,
            f"POINTS payload out of range [0, 1]: {fraction}",
        )
    message = None
    if len(lines) > 1:
        msg_match = _MSG_RE.match(lines[1].strip())
        if msg_match and msg_match.group(1).strip():
            message = msg_match.group(1).strip()
    return fraction, message, None


def run_prepared_checker(
    spec: LanguageSpec,
    workspace_dir: pathlib.Path,
) -> tuple[str, float | None, str]:
    """Run the prepared checker once against the evidence files.

    The three evidence files (:data:`CHECKER_INPUT_FILE`,
    :data:`CHECKER_USER_OUTPUT_FILE`, :data:`CHECKER_ANSWER_FILE`) must
    already be written into ``workspace_dir``. Returns
    ``(verdict, points_fraction, message)`` where ``points_fraction`` is
    ``None`` for full-credit outcomes and a ``0..1`` float for exit-7
    partial awards.
    """
    source_suffix = pathlib.Path(spec.source_filename).suffix
    checker_source_name = CHECKER_SOURCE_BASENAME + source_suffix

    checker_run_args = list(
        spec.run_argv(
            source_name=checker_source_name,
            artifact_name=CHECKER_ARTIFACT_NAME,
        )
    )
    checker_run_args += [
        CHECKER_INPUT_FILE,
        CHECKER_USER_OUTPUT_FILE,
        CHECKER_ANSWER_FILE,
    ]

    command_to_time_checker = [
        "/usr/bin/time",
        "-f",
        "%U %S %M %x %P %e",
        *checker_run_args,
    ]
    command_for_sandbox_checker = [
        "timeout",
        "--signal=SIGKILL",
        f"{CHECKER_TIME_LIMIT_S + 1}s",
        *command_to_time_checker,
    ]

    if get_judge_backend() == CONTAINER:
        full_checker_run_cmd = build_command(
            command_for_sandbox_checker,
            backend=CONTAINER,
            workdir=str(workspace_dir),
        )
    else:
        full_checker_run_cmd = build_docker_run_command(
            command_for_sandbox_checker,
            bind_dir=str(workspace_dir.resolve()),
            docker_image=spec.docker_image,
            memory_limit_kb=CHECKER_MEM_LIMIT_KB,
        )

    print(f"Executing Custom Checker: {' '.join(full_checker_run_cmd)}")
    checker_stdout, checker_stderr = "", ""
    try:
        checker_process = subprocess.run(
            full_checker_run_cmd,
            input="",
            capture_output=True,
            text=True,
            timeout=CHECKER_TIME_LIMIT_S + 3,
        )
        checker_stdout = checker_process.stdout or ""
        checker_stderr = checker_process.stderr or ""
        checker_resource_msg = ""
        if checker_stderr:
            lines = checker_stderr.strip().splitlines()
            if lines:
                for i_line in range(len(lines) - 1, -1, -1):
                    parts = lines[i_line].split()
                    if len(parts) >= 6 and parts[4].endswith("%"):
                        checker_resource_msg = (
                            f"\nChecker Resources: {lines[i_line]}"
                        )
                        break
        feedback = (
            f"Checker STDOUT:\n{checker_stdout}\n"
            f"Checker STDERR:\n{checker_stderr}{checker_resource_msg}"
        )
        exit_code = checker_process.returncode
        if exit_code == 124:
            return (
                _VERDICT_INTERNAL_ERROR,
                None,
                f"Checker timed out.\n{feedback}",
            )
        if exit_code == _EXIT_OK:
            return _VERDICT_ACCEPTED, None, feedback
        if exit_code == _EXIT_WRONG_ANSWER:
            return (
                _VERDICT_WRONG_ANSWER,
                None,
                f"Checker indicated failure (code 1).\n{feedback}",
            )
        if exit_code == _EXIT_PRESENTATION_ERROR:
            # testlib _pe: presentation error. The judge has no separate PE
            # verdict, so it maps to WA (the solve did not fully succeed).
            return (
                _VERDICT_WRONG_ANSWER,
                None,
                "Checker indicated presentation error (code 2, mapped to "
                f"WA).\n{feedback}",
            )
        if exit_code == _EXIT_PARTIAL:
            fraction, points_msg, parse_error = parse_points_payload(
                checker_stdout
            )
            if parse_error is not None:
                return (
                    _VERDICT_INTERNAL_ERROR,
                    None,
                    f"Invalid checker partial-points payload: {parse_error}\n"
                    f"{feedback}",
                )
            if fraction == 0.0:
                return (
                    _VERDICT_WRONG_ANSWER,
                    0.0,
                    (f"Checker message: {points_msg}\n" if points_msg else "")
                    + f"Checker awarded zero points.\n{feedback}",
                )
            message = f"Checker message: {points_msg}\n" if points_msg else ""
            return (
                _VERDICT_ACCEPTED,
                fraction,
                f"{message}Checker awarded {fraction:.0%} of points.\n{feedback}",
            )
        # Any other exit is a checker crash per protocol — judge-side error,
        # never a silent WA (D-J7: "any other exit ... = IE").
        return (
            _VERDICT_INTERNAL_ERROR,
            None,
            f"Checker exited with unexpected code {exit_code}.\n{feedback}",
        )
    except subprocess.TimeoutExpired:
        return _VERDICT_INTERNAL_ERROR, None, "Checker communication timeout."
    except FileNotFoundError:
        return _VERDICT_INTERNAL_ERROR, None, "Docker/checker cmd not found."
    except Exception as e:
        return (
            _VERDICT_INTERNAL_ERROR,
            None,
            f"Checker run error: {str(e)}\n"
            f"STDOUT: {checker_stdout}\nSTDERR: {checker_stderr}",
        )


def run_custom_checker(
    checker_code: str,
    checker_language: str,
    input_file_path: pathlib.Path,
    user_output_file_path: pathlib.Path,
    answer_file_path: pathlib.Path,
    checker_submission_dir: pathlib.Path,
) -> tuple[str, float | None, str]:
    """One-shot compile + single run of a custom checker (protocol v2).

    Returns ``(verdict, points_fraction, message)``. Looping callers
    (the judge task) use :func:`compile_checker` once plus
    :func:`run_prepared_checker` per test so the checker binary is
    compiled once per submission, not once per test (D-J7).
    """
    print(
        f"Running custom checker ({checker_language}) in {checker_submission_dir}"
    )

    compile_ok, compile_message, spec = compile_checker(
        checker_code, checker_language, checker_submission_dir
    )
    if not compile_ok:
        return _VERDICT_INTERNAL_ERROR, None, compile_message

    # The one-shot caller passes evidence paths; copy them under the
    # conventional names the prepared runner expects (non-destructive so
    # the caller's files survive repeated runs; a no-op when the caller
    # already placed them under the conventional names).
    def _stage(src: pathlib.Path, dst_name: str) -> None:
        dst = checker_submission_dir / dst_name
        if src.resolve() != dst.resolve():
            shutil.copyfile(src, dst)

    _stage(input_file_path, CHECKER_INPUT_FILE)
    _stage(user_output_file_path, CHECKER_USER_OUTPUT_FILE)
    _stage(answer_file_path, CHECKER_ANSWER_FILE)

    return run_prepared_checker(spec, checker_submission_dir)
