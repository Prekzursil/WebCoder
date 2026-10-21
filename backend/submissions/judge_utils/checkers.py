"""Run a problem's custom checker program against one test case.

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
import subprocess

from ..models import Submission  # For Submission.VerdictStatus
from .backend import (
    CONTAINER,
    build_command,
    build_docker_run_command,
    get_judge_backend,
)
from .compilation import run_compile_step
from .languages import get_language

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

#: Checker evidence files (created by tasks.py in the checker workspace).
CHECKER_INPUT_FILE = "input.txt"
CHECKER_USER_OUTPUT_FILE = "user_output.txt"
CHECKER_ANSWER_FILE = "answer.txt"

#: Basename for checker sources/artifacts (extension comes from the spec).
CHECKER_SOURCE_BASENAME = "checker"
CHECKER_ARTIFACT_NAME = "checker_program"


def run_custom_checker(
    checker_code: str,
    checker_language: str,
    input_file_path: pathlib.Path,
    user_output_file_path: pathlib.Path,
    answer_file_path: pathlib.Path,
    checker_submission_dir: pathlib.Path,
) -> tuple[str, str]:
    # The verdict is a Submission.VerdictStatus member, which is a ``str``
    # subclass at runtime (Django TextChoices); typed as ``str`` so callers
    # and the type checker agree on its string identity.
    print(f"Running custom checker ({checker_language}) in {checker_submission_dir}")

    spec = get_language(checker_language)
    if spec is None or spec.language_id == "java11":
        return (
            _VERDICT_INTERNAL_ERROR,
            f"Unsupported checker language: {checker_language}",
        )

    source_suffix = pathlib.Path(spec.source_filename).suffix
    checker_source_name = CHECKER_SOURCE_BASENAME + source_suffix
    checker_source_file = checker_submission_dir / checker_source_name
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
                workdir=checker_submission_dir,
                docker_image=spec.docker_image,
            )
        except Exception as e:  # defensive: run_compile_step fails closed itself
            compile_ok, compiler_out = False, f"Checker compile error: {str(e)}"
        if not compile_ok:
            return (
                _VERDICT_INTERNAL_ERROR,
                f"Checker compile failed.\n{compiler_out}",
            )
    else:
        compiler_out = "Checker is interpreted."

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
            workdir=str(checker_submission_dir),
        )
    else:
        full_checker_run_cmd = build_docker_run_command(
            command_for_sandbox_checker,
            bind_dir=str(checker_submission_dir.resolve()),
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
        if checker_process.returncode == 124:
            return (
                _VERDICT_INTERNAL_ERROR,
                f"Checker timed out.\n{feedback}",
            )
        exit_code = checker_process.returncode
        if exit_code == 0:
            return _VERDICT_ACCEPTED, feedback
        # For checkers, non-zero often means WA, but could be PE or other
        # custom codes. Defaulting to WA for simplicity here.
        return (
            _VERDICT_WRONG_ANSWER,
            f"Checker indicated failure (code {exit_code}).\n{feedback}",
        )
    except subprocess.TimeoutExpired:
        return _VERDICT_INTERNAL_ERROR, "Checker communication timeout."
    except FileNotFoundError:
        return _VERDICT_INTERNAL_ERROR, "Docker/checker cmd not found."
    except Exception as e:
        return (
            _VERDICT_INTERNAL_ERROR,
            f"Checker run error: {str(e)}\n"
            f"STDOUT: {checker_stdout}\nSTDERR: {checker_stderr}",
        )
