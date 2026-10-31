"""Run a compiled/submitted solution against one test case in the sandbox.

The per-language run knowledge lives in
:mod:`submissions.judge_utils.languages` (the registry). This module wraps
the registry's run argv in the in-container ``timeout`` + ``/usr/bin/time``
resource-measurement harness and executes it under the configured judge
backend (:mod:`submissions.judge_utils.backend`):

- ``JUDGE_BACKEND=container`` (production): ``docker exec`` into the hardened
  ``webcoder-judge-runner`` container with the submission workspace on the
  shared ``/srv/judge`` volume. No host bind-mounts, no per-run containers.
- ``JUDGE_BACKEND=local`` (host dev): a per-run ``docker run`` bind-mounting
  the submission workspace from the host.

Verdict classification (in order):

1. exit 124 — wall-clock timeout killed the program → ``TLE``;
2. exit 137 / SIGKILL (``-9``) — the program was SIGKILLed; under the judge
   sandbox that means the OOM killer (cgroup memory ceiling) → genuine
   ``MLE`` (no longer mis-reported as ``RE``);
3. measured CPU time over the limit → ``TLE``;
4. measured peak RSS (``/usr/bin/time %M``) over the memory limit → ``MLE``;
5. output above the judge's output-size cap → ``OLE`` (JDG-7);
6. exit 0 → ``AC`` (output comparison happens in ``tasks.py``);
7. anything else → ``RE``, with POSIX signals mapped to actionable
   messages (SIGSEGV/SIGFPE/SIGABRT/…, JDG-7).

The legacy verdict-forging trigger substrings (TLE/MLE/RE simulation
markers embedded in test input or source code) were removed from this
production path (SECURITY-AUDIT-judge.md J2 / SPEC-GAPS G10); simulated
verdicts exist only in test fixtures via mocked process results.

E1 network restriction (SPEC-GAPS J3 / SECURITY-AUDIT-judge.md J1): judged
runs NEVER receive network access or a writable submission mount. The
python3 custom-libs pip install moved to a separate one-shot container
(:mod:`submissions.judge_utils.custom_libs`) whose egress is fail-closed by
default; the run below only sets ``PYTHONPATH=libs`` so the program sees the
pre-installed packages. The legacy ``--network bridge`` + ``rw`` mount
custom-libs flow is gone.
"""

import pathlib
import subprocess

from django.conf import settings

from ..models import Submission
from .backend import (
    CONTAINER,
    build_command,
    build_docker_run_command,
    get_judge_backend,
)
from .custom_libs import LIBS_DIR_NAME
from .languages import get_language

# Placeholder path for Java external libraries inside the per-run container
# (LOCAL backend only): JUDGE_JAVA_LIBS_DIR_HOST is mounted here.
CONTAINER_JAVA_HOST_LIBS_MOUNT_PATH = "/app/host_java_libs"

#: /usr/bin/time -f format: user_cpu sys_cpu max_rss_kb exit pct cpu wall.
TIME_FORMAT_STRING = "%U %S %M %x %P %e"

#: Exit codes that indicate the judged process was SIGKILLed (OOM killer).
#: Live-stack measurement (2026-10-31, coreutils 9.7 in the judge-runner):
#: ``timeout --signal=SIGKILL`` does NOT exit 124 — it propagates the
#: child's kill status (137) — so every live CPU-TLE was classified as
#: MLE. The sandbox now uses the default TERM signal plus ``-k 1`` (hard
#: SIGKILL one second later), which exits 124 correctly for both paths;
#: a raw 128+9=137 reaching us is therefore the kernel/cgroup OOM kill
#: (or equivalent SIGKILL) — the original intent of this tuple.
OOM_EXIT_CODES = (137, -9)

#: JDG-7 (competitive roadmap): map POSIX termination signals to actionable
#: messages — the single biggest debuggability gap between judges (DMOJ
#: "segfault / bad_alloc / syscall disallowed", pbinfo "Killed by signal n").
#: Keys are bare signal numbers; docker/exec layers propagate exits as
#: ``128 + sig`` and host-side subprocess reports ``-sig`` — both are
#: normalized in :func:`signal_feedback`.
SIGNAL_MESSAGES: dict[int, str] = {
    6: "Aborted (SIGABRT — check assertions/aborts)",
    8: "Floating point exception (SIGFPE — division by zero?)",
    4: "Illegal instruction (SIGILL)",
    11: "Segmentation fault (SIGSEGV — invalid memory access)",
    5: "Trace/breakpoint trap (SIGTRAP)",
}


def signal_feedback(returncode: int) -> str | None:
    """JDG-7: actionable message for a signal-killed run, else ``None``."""
    code = abs(returncode)
    if code > 128:
        code -= 128
    return SIGNAL_MESSAGES.get(code)


def run_code_in_sandbox(
    executable_path_str: str,
    language: str,
    input_data: str,
    time_limit_ms: int,
    memory_limit_kb: int,
    submission_dir: pathlib.Path,
    custom_libraries_allowed: list[str] | None = None,
    io_files: tuple[str, str] | None = None,
    banned_stdlib_modules: list[str] | None = None,
):
    """Runs code in the judge sandbox.

    Returns: (verdict: VerdictStatus, execution_time_ms: int, memory_used_kb: int, output_data: str, error_output: str)

    ``io_files`` (competitive roadmap RO-4): ``(input_filename,
    output_filename)`` for FILES-mode problems — the program reads its input
    from and writes its output to files in the working directory instead of
    stdin/stdout. The caller pre-writes the input file into
    ``submission_dir``; this function pipes nothing on stdin, mounts the
    submission dir read-write (the program must create the output file), and
    reads the output file back as the run's output. A missing output file
    maps to RUNTIME_ERROR with an explicit message.

    ``banned_stdlib_modules`` (wave C): non-empty only for python3 — the
    judged run goes through a generated ``_wc_guard.py`` that installs a
    meta-path import blocker for those modules (fail-closed for dynamic
    imports) and then runs the submitted program with runpy.
    """

    print(
        f"Attempting to run {language} (executable {executable_path_str}) "
        f"with input: {input_data[:30]}..."
    )
    if custom_libraries_allowed is None:
        custom_libraries_allowed = []

    final_verdict = Submission.VerdictStatus.INTERNAL_ERROR
    final_time_ms = -1
    final_mem_kb = -1
    final_output = ""
    final_error = "Judge execution did not complete as expected."

    spec = get_language(language)
    if spec is None:
        return (
            final_verdict,
            final_time_ms,
            final_mem_kb,
            final_output,
            f"Unsupported language for execution: {language}",
        )

    if time_limit_ms <= 0:
        # Zero/negative time limit floors to one second — same rule the
        # in-container timeout below applies. Without this, the CPU-time
        # comparison at the verdict stage sees 0ms and every parsed run
        # reads as TLE.
        time_limit_ms = 1000
    time_limit_s = time_limit_ms / 1000.0

    program_and_args: list[str] = list(spec.run_command)
    extra_volume_mounts: list[str] = []
    # RO-4: FILES-mode programs write their output file into the working
    # directory, so the submission mount must be writable for them.
    mount_mode = "rw" if io_files else "ro"
    # E1/J3: judged runs NEVER get network egress or a writable submission
    # mount — the python3 custom-libs pip install now happens in a separate
    # one-shot container (judge_utils/custom_libs.install_custom_libs,
    # network-fail-closed by default), and the run below only points
    # PYTHONPATH at the pre-installed <submission_dir>/libs.
    network_mode = "none"

    backend = get_judge_backend()

    if language == "python3" and banned_stdlib_modules:
        # Wave C: write the generated import guard next to the program and
        # run THROUGH it — the guard bans the modules at meta-path level
        # (fail-closed for importlib.import_module and aliasing), then
        # runpy's the submitted source with __main__ semantics. Custom
        # libs (if any) stay on PYTHONPATH for the guarded run too.
        from problems.feature_policy import build_python_import_guard

        guard_path = submission_dir / "_wc_guard.py"
        guard_path.write_text(
            build_python_import_guard(banned_stdlib_modules), encoding="utf-8"
        )
        if custom_libraries_allowed:
            program_and_args = [
                "sh",
                "-c",
                f"PYTHONPATH={LIBS_DIR_NAME}:$PYTHONPATH python _wc_guard.py",
            ]
        else:
            program_and_args = ["python", "_wc_guard.py"]

    elif language == "python3" and custom_libraries_allowed:
        program_and_args = [
            "sh",
            "-c",
            f"PYTHONPATH={LIBS_DIR_NAME}:$PYTHONPATH python {spec.source_filename}",
        ]

    elif language == "java11" and custom_libraries_allowed:
        classpath_parts = ["."]
        if backend == CONTAINER:
            print(
                "Warning: Java custom libraries requested, but the container "
                "judge backend has no host mounts; running without JARs."
            )
        else:
            host_java_libs_dir_str = settings.JUDGE_JAVA_LIBS_DIR_HOST
            if host_java_libs_dir_str:
                host_java_libs_dir = pathlib.Path(host_java_libs_dir_str)
                if host_java_libs_dir.exists() and host_java_libs_dir.is_dir():
                    print(
                        f"Java custom libraries requested. Mounting from "
                        f"{host_java_libs_dir} to "
                        f"{CONTAINER_JAVA_HOST_LIBS_MOUNT_PATH}"
                    )
                    extra_volume_mounts.extend(
                        [
                            "-v",
                            f"{str(host_java_libs_dir.resolve())}:"
                            f"{CONTAINER_JAVA_HOST_LIBS_MOUNT_PATH}:ro",
                        ]
                    )
                    for jar_filename in custom_libraries_allowed:
                        # Allowlist-style filter: JAR names must be plain
                        # filenames (no traversal, no separators, no ``:``
                        # classpath-separator injection).
                        if not _is_safe_jar_name(jar_filename):
                            print(
                                f"Warning: Skipping potentially unsafe JAR "
                                f"filename in custom_libraries_allowed: "
                                f"{jar_filename}"
                            )
                            continue
                        classpath_parts.append(
                            f"{CONTAINER_JAVA_HOST_LIBS_MOUNT_PATH}/{jar_filename}"
                        )
                elif not host_java_libs_dir.exists():
                    print(
                        f"Warning: Java libraries requested, but "
                        f"JUDGE_JAVA_LIBS_DIR_HOST '{host_java_libs_dir_str}' "
                        f"does not exist."
                    )
                else:
                    print(
                        f"Warning: Java libraries requested, but "
                        f"JUDGE_JAVA_LIBS_DIR_HOST '{host_java_libs_dir_str}' "
                        f"is not a directory."
                    )
            else:
                print(
                    "Warning: Java libraries requested, but "
                    "JUDGE_JAVA_LIBS_DIR_HOST is not configured in settings."
                )
        program_and_args = ["java", "-cp", ":".join(classpath_parts), "Main"]

    command_to_time = [
        "/usr/bin/time",
        "-f",
        TIME_FORMAT_STRING,
        *program_and_args,
    ]
    # TERM at the wall limit (exit 124 on timeout — the TLE contract),
    # SIGKILL one second later for programs that ignore TERM. Do NOT use
    # ``--signal=SIGKILL`` here: coreutils 9.7 propagates the child's
    # kill status (137) instead of exiting 124, which the judge then
    # misclassifies as an OOM kill (MLE) — measured on the live stack.
    command_for_sandbox = [
        "timeout",
        "-k",
        "1",
        f"{time_limit_s + 1:.2f}s",
        *command_to_time,
    ]

    if backend == CONTAINER:
        run_command = build_command(
            command_for_sandbox, backend=CONTAINER, workdir=str(submission_dir)
        )
    else:
        run_command = build_docker_run_command(
            command_for_sandbox,
            bind_dir=str(submission_dir.resolve()),
            docker_image=spec.docker_image,
            memory_limit_kb=memory_limit_kb,
            extra_volume_mounts=extra_volume_mounts,
            mount_mode=mount_mode,
            # E1: every judged run is network-isolated, custom libs or not
            # (pip moved to the fail-closed install phase — custom_libs.py).
            network=network_mode,
        )

    print(f"Executing sandbox command for {language}: {' '.join(run_command)}")

    # Host-side communication window: subprocess.run kills the spawned
    # docker client on expiry (no leaked client processes). No pip tail any
    # more — library installs happen in their own container (custom_libs.py)
    # before the first judged run.
    process_timeout = time_limit_s + 3

    try:
        result = subprocess.run(
            run_command,
            # RO-4: FILES-mode programs take no stdin — their input waits in
            # the working-directory file the caller wrote.
            input="" if io_files else input_data,
            capture_output=True,
            text=True,
            timeout=process_timeout,
        )
        stdout_data = result.stdout or ""
        stderr_data = result.stderr or ""
        returncode = result.returncode

        time_output_parsed = False
        resource_usage_line = None
        program_actual_stderr_lines: list[str] = []

        if stderr_data:
            lines = stderr_data.strip().splitlines()
            if lines:
                for i_line in range(len(lines) - 1, -1, -1):
                    parts = lines[i_line].split()
                    if len(parts) >= 6 and parts[4].endswith("%"):
                        resource_usage_line = lines[i_line]
                        program_actual_stderr_lines = lines[:i_line]
                        break
                if not resource_usage_line:
                    program_actual_stderr_lines = lines

        parsed_stderr = "\n".join(program_actual_stderr_lines).strip()

        actual_time_ms = -1
        actual_mem_kb = -1
        if resource_usage_line:
            try:
                parts = resource_usage_line.split()
                user_cpu_s, sys_cpu_s = float(parts[0]), float(parts[1])
                actual_mem_kb, actual_time_ms = (
                    int(parts[2]),
                    int((user_cpu_s + sys_cpu_s) * 1000),
                )
                time_output_parsed = True
            except (ValueError, IndexError) as parse_err:
                print(
                    f"Warning: Could not parse resource usage for {language}: "
                    f"'{resource_usage_line}'. Error: {parse_err}"
                )

        final_output = stdout_data
        final_error = parsed_stderr
        final_time_ms = actual_time_ms
        final_mem_kb = actual_mem_kb

        # RO-4 FILES mode: the program's answer is the output FILE it was
        # required to create — stdout is irrelevant. Read the file back as
        # the run's output (this is what the docstring always promised; the
        # readback itself was missing — found by this wave's live-stack
        # acceptance pass). A clean-exiting program that never created the
        # file is resolved to RUNTIME_ERROR below the verdict chain, with a
        # message naming the file, instead of a silent empty-output WA.
        missing_output_file = False
        if io_files and returncode == 0:
            output_path = submission_dir / io_files[1]
            if output_path.exists():
                final_output = output_path.read_text(encoding="utf-8")
            else:
                missing_output_file = True
                final_output = ""

        if returncode == 124:
            final_verdict, final_error, final_time_ms = (
                Submission.VerdictStatus.TIME_LIMIT_EXCEEDED,
                parsed_stderr + f"\nTimeout (>{time_limit_s}s).",
                time_limit_ms,
            )
        elif returncode in OOM_EXIT_CODES:
            final_verdict = Submission.VerdictStatus.MEMORY_LIMIT_EXCEEDED
            final_error = (
                parsed_stderr
                + f"\nMemory limit exceeded (exit code {returncode} — "
                f"process was killed, typically the OOM killer)."
            )
            if final_mem_kb and final_mem_kb > 0:
                final_error += f" Peak RSS: {final_mem_kb} KB."
            final_mem_kb = memory_limit_kb if final_mem_kb <= 0 else final_mem_kb
        elif time_output_parsed and actual_time_ms > time_limit_ms:
            final_verdict, final_error = (
                Submission.VerdictStatus.TIME_LIMIT_EXCEEDED,
                parsed_stderr + f"\nCPU TLE ({actual_time_ms}ms > {time_limit_ms}ms).",
            )
        elif (
            time_output_parsed
            and memory_limit_kb > 0
            and actual_mem_kb > memory_limit_kb
        ):
            final_verdict = Submission.VerdictStatus.MEMORY_LIMIT_EXCEEDED
            final_error = (
                parsed_stderr
                + f"\nMemory limit exceeded ({actual_mem_kb}KB > "
                f"{memory_limit_kb}KB)."
            )
        elif (
            len(final_output.encode("utf-8", errors="replace"))
            > settings.JUDGE_OUTPUT_LIMIT_BYTES
        ):
            # JDG-7: output-size cap — printing gigabytes must read as OLE,
            # not as a mysterious judge hang or MLE. In FILES mode the
            # program's output IS the file, so the cap applies there too.
            final_verdict = Submission.VerdictStatus.OUTPUT_LIMIT_EXCEEDED
            final_error = (
                f"Output limit exceeded (>{settings.JUDGE_OUTPUT_LIMIT_BYTES} "
                f"bytes produced on one test)."
            )
        elif returncode == 0:
            final_verdict = Submission.VerdictStatus.ACCEPTED
        else:
            final_verdict = Submission.VerdictStatus.RUNTIME_ERROR
            mapped = signal_feedback(returncode)
            if mapped:
                final_error = parsed_stderr + f"\n{mapped} (exit code {returncode})."
            else:
                final_error = parsed_stderr + f"\nExit code: {returncode}."
            if not time_output_parsed and stderr_data:
                final_error = stderr_data + f"\nExit code: {returncode}."

        # RO-4 FILES mode: a clean-exiting program that never created the
        # required output file is a RUNTIME_ERROR with a message naming the
        # file (overriding the AC the exit code alone would imply).
        if missing_output_file:
            final_verdict = Submission.VerdictStatus.RUNTIME_ERROR
            final_error = (
                parsed_stderr
                + f"\nProgram exited normally but did not create the "
                f"required output file '{io_files[1]}'."
            )

    except subprocess.TimeoutExpired:
        final_verdict, final_error, final_time_ms, final_mem_kb = (
            Submission.VerdictStatus.TIME_LIMIT_EXCEEDED,
            f"Communicate timeout after {process_timeout}s.",
            int(process_timeout * 1000),
            memory_limit_kb,
        )
    except FileNotFoundError:
        final_verdict, final_error = (
            Submission.VerdictStatus.INTERNAL_ERROR,
            "Docker command not found.",
        )
    except Exception as e:
        final_verdict, final_error = (
            Submission.VerdictStatus.INTERNAL_ERROR,
            f"Execution error for {language}: {str(e)}",
        )

    return final_verdict, final_time_ms, final_mem_kb, final_output, final_error


def _is_safe_jar_name(name: str) -> bool:
    """Allowlist check for JAR filenames in custom_libraries_allowed.

    Blocks path traversal (``..``, separators) and the Java classpath
    separator ``:`` (SECURITY-AUDIT-judge.md J13 — the legacy denylist let
    ``x.jar:.`` inject extra classpath entries).
    """
    return (
        isinstance(name, str)
        and name.endswith(".jar")
        and all(ch.isalnum() or ch in "-_." for ch in name)
        and ".." not in name
    )
