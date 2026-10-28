"""Interactive problem judging (competitive roadmap JDG-2).

Runs the submission and an author-written **interactor** as a connected
pair: the interactor converses with the submission over piped stdio and
decides the verdict, the DMOJ/Codeframes pattern that unlocks games,
adaptive queries and communication problems.

Protocol (documented for authors in the problem form):

- The interactor is compiled once per submission from
  ``Problem.interactor_code`` in ``Problem.interactor_language`` (any
  non-Java judge-registry language — the same authoring surface as custom
  checkers).
- Per test case the judge writes the test input to ``input.txt`` and the
  expected output to ``answer.txt`` in the interactor workspace and runs::

      interactor input.txt answer.txt

- Wiring (both judge backends; each side is a host process whose stdio is
  cross-connected at the host):

      interactor.stdout  ->  submission.stdin
      submission.stdout  ->  interactor.stdin
      interactor.stderr  ->  feedback / POINTS payload

  Because stdout belongs to the conversation, the verdict payload travels
  on **stderr** — the one deliberate difference from checker protocol v2.
- Verdict mapping mirrors checker protocol v2 (testlib-compatible exit
  codes):

  =====  =====================================  =========================
  exit   meaning                                 judged as
  =====  =====================================  =========================
  0      OK                                       AC, full points
  1      wrong answer                             WA
  2      presentation error                       WA
  7      partial points                           stderr must lead with
                                                  ``POINTS <float 0..1>``
                                                  (optional ``MSG <text>``
                                                  second line)
  other  interactor crash / bad exit              IE
  =====  =====================================  =========================

- Resource envelope: the submission gets the problem's effective limits
  (J5 registry multipliers apply); the interactor runs under the fixed
  checker envelope (10 s / 256 MB). The PAIR is bounded by a wall-clock
  cap (``2x time limit, floored at 10 s``) — interactive programs may idle
  waiting for the other side, so CPU time alone cannot judge them (the
  roadmap's "wall-time cap").
- Verdict precedence (documented in the problem form):

  1. pair wall-clock watchdog fired -> ``TLE`` (interaction deadlocked or
     submission ran away);
  2. submission killed by its inner wall timeout -> ``TLE``;
  3. submission peak RSS over the limit -> ``MLE`` (JDG-7 ladder);
  4. submission CPU time over the limit -> ``TLE``;
  5. interactor exit mapping (0/1/2/7) — the authoritative conversation
     verdict;
  6. anything unexpected -> ``IE``.

  A non-zero submission exit code is REPORTED in the feedback but never
  overrides the interactor: after the interactor closes the conversation a
  well-behaved submission simply sees EOF (Codeforces semantics — the
  interactor owns the verdict). Objective resource violations DO override
  (rows 1-4).

The pair spawns through the configured judge backend
(:mod:`submissions.judge_utils.backend`): two ``docker exec -i`` processes
into the hardened judge-runner (production; both workspaces live on the
shared ``/srv/judge`` volume) or two per-run ``docker run -i`` containers
(local host dev). The pipes are wired at the HOST level, so the same code
drives both backends — and bare host processes on a dev box without
Docker (used by the test suite on non-POSIX hosts, where the Linux-only
``timeout`` / ``/usr/bin/time`` prefixes are skipped).
"""

import os
import pathlib
import subprocess
import threading

from ..models import Submission
from .backend import (
    CONTAINER,
    build_command,
    build_docker_run_command,
    get_judge_backend,
)
from .checkers import compile_checker, parse_points_payload
from .execution import TIME_FORMAT_STRING
from .languages import LanguageSpec, get_language

_VERDICT_INTERNAL_ERROR: str = str(Submission.VerdictStatus.INTERNAL_ERROR)
_VERDICT_ACCEPTED: str = str(Submission.VerdictStatus.ACCEPTED)
_VERDICT_WRONG_ANSWER: str = str(Submission.VerdictStatus.WRONG_ANSWER)
_VERDICT_TLE: str = str(Submission.VerdictStatus.TIME_LIMIT_EXCEEDED)
_VERDICT_MLE: str = str(Submission.VerdictStatus.MEMORY_LIMIT_EXCEEDED)

#: Fixed resource envelope for the interactor itself (same as checkers).
INTERACTOR_TIME_LIMIT_S = 10
INTERACTOR_MEM_LIMIT_KB = 262144

#: Basenames for interactor sources/artifacts inside its workspace.
INTERACTOR_SOURCE_BASENAME = "interactor"
INTERACTOR_ARTIFACT_NAME = "interactor_program"
INTERACTOR_INPUT_FILE = "input.txt"
INTERACTOR_ANSWER_FILE = "answer.txt"

#: Pair wall-clock floor/cap (seconds): interactive programs may idle in
#: conversation, so the pair gets at least this long before the watchdog.
WALL_CAP_MIN_S = 10
WALL_CAP_MAX_S = 60

#: Grace for the submission to exit after the interactor ends the
#: conversation (EOF on its stdin).
POST_INTERACTOR_GRACE_S = 5

#: Exit code of the GNU ``timeout`` wrapper.
_TIMEOUT_EXIT = 124


def compile_interactor(
    interactor_code: str,
    interactor_language: str,
    workspace_dir: pathlib.Path,
) -> tuple[bool, str, LanguageSpec | None]:
    """Compile the interactor ONCE per submission (JDG-2).

    Thin delegation to :func:`checkers.compile_checker` with the
    interactor's file names — identical toolchain, separate namespace so
    a checker and an interactor never collide in one workspace.
    """
    return compile_checker(
        interactor_code,
        interactor_language,
        workspace_dir,
        source_basename=INTERACTOR_SOURCE_BASENAME,
        artifact_name=INTERACTOR_ARTIFACT_NAME,
    )


def _interactor_run_argv(spec: LanguageSpec) -> list[str]:
    """Run argv for the compiled interactor + evidence file arguments."""
    source_suffix = pathlib.Path(spec.source_filename).suffix
    source_name = INTERACTOR_SOURCE_BASENAME + source_suffix
    argv = list(
        spec.run_argv(
            source_name=source_name,
            artifact_name=INTERACTOR_ARTIFACT_NAME,
        )
    )
    argv += [INTERACTOR_INPUT_FILE, INTERACTOR_ANSWER_FILE]
    return argv


def _wrap_command(
    bare_argv: list[str],
    workdir: pathlib.Path,
    docker_image: str,
    memory_limit_kb: int,
    wall_cap_s: float,
    hard_timeout_s: float,
) -> list[str]:
    """Wrap one side of the pair for the configured judge backend.

    On POSIX hosts the bare argv is prefixed with the in-container
    ``timeout --signal=SIGKILL`` + ``/usr/bin/time`` measurement harness
    (identical to the batch path in ``execution.py`` / ``checkers.py``) so
    a hung side cannot outlive the pair cap even if the host-side kill
    misses a detached container. Non-POSIX dev hosts have no ``timeout`` /
    ``/usr/bin/time``, so the bare argv runs as-is (resource measurement
    degrades to zero — judged environments are always Linux containers).
    """
    command = list(bare_argv)
    if os.name == "posix":
        command = [
            "timeout",
            "--signal=SIGKILL",
            f"{hard_timeout_s:g}s",
            "/usr/bin/time",
            "-f",
            TIME_FORMAT_STRING,
            *command,
        ]
    if get_judge_backend() == CONTAINER:
        return build_command(command, backend=CONTAINER, workdir=str(workdir))
    return build_docker_run_command(
        command,
        bind_dir=str(workdir.resolve()),
        docker_image=docker_image,
        memory_limit_kb=memory_limit_kb,
        interactive=True,
    )


def _drain(pipe, sink: list) -> None:
    """Read a binary pipe to EOF into *sink* (keeps small pipes from
    blocking the writer when a submission print-spams stderr)."""
    try:
        sink.append(pipe.read())
    finally:
        pipe.close()


def _parse_resource_line(stderr_text: str) -> tuple[int, int]:
    """Extract ``(cpu_ms, max_rss_kb)`` from the last /usr/bin/time line.

    The time format string is ``%U %S %M %x %P %e`` — six fields, the
    fifth carrying the ``%`` CPU marker (same shape ``execution.py`` and
    ``checkers.py`` scan for). Returns ``(0, 0)`` when absent (non-POSIX
    dev hosts / early kills).
    """
    for line in reversed(stderr_text.strip().splitlines()):
        parts = line.split()
        if len(parts) >= 6 and parts[4].endswith("%"):
            try:
                cpu_s = float(parts[0]) + float(parts[1])
                rss_kb = int(parts[2])
                return int(cpu_s * 1000), rss_kb
            except ValueError:
                continue
    return 0, 0


def run_interactive_pair(
    user_run_argv: list[str],
    user_language: str,
    user_workdir: pathlib.Path,
    interactor_spec: LanguageSpec,
    interactor_workdir: pathlib.Path,
    time_limit_ms: int,
    memory_limit_kb: int,
) -> tuple[str, int, int, float | None, str]:
    """Run one interactive test: submission <-> interactor over pipes.

    Returns ``(verdict, time_ms, mem_kb, points_fraction, feedback)`` —
    the same shape as ``execution.run_code_in_sandbox`` plus the checker
    protocol's partial fraction (exit-7 ``POINTS`` on interactor stderr).
    """
    user_spec = get_language(user_language)
    user_image = user_spec.docker_image if user_spec else "python:3.11-slim"

    wall_cap_s = min(
        max(2 * (time_limit_ms / 1000.0), WALL_CAP_MIN_S), WALL_CAP_MAX_S
    )

    feedback_parts: list[str] = []
    p_user = p_int = None
    user_stderr_buf: list[bytes] = []
    int_stderr_buf: list[bytes] = []
    try:
        user_cmd = _wrap_command(
            list(user_run_argv),
            user_workdir,
            user_image,
            memory_limit_kb,
            wall_cap_s,
            hard_timeout_s=wall_cap_s,
        )
        interactor_cmd = _wrap_command(
            _interactor_run_argv(interactor_spec),
            interactor_workdir,
            interactor_spec.docker_image,
            INTERACTOR_MEM_LIMIT_KB,
            wall_cap_s,
            hard_timeout_s=INTERACTOR_TIME_LIMIT_S + 1,
        )
        p_user = subprocess.Popen(
            user_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        p_int = subprocess.Popen(
            interactor_cmd,
            stdin=p_user.stdout,
            stdout=p_user.stdin,
            stderr=subprocess.PIPE,
        )
        # The parent's copies of the crossed pipe ends must close so each
        # side sees EOF when the other exits (the children own them now).
        p_user.stdout.close()
        p_user.stdin.close()

        t_user = threading.Thread(
            target=_drain, args=(p_user.stderr, user_stderr_buf), daemon=True
        )
        t_int = threading.Thread(
            target=_drain, args=(p_int.stderr, int_stderr_buf), daemon=True
        )
        t_user.start()
        t_int.start()

        try:
            int_rc = p_int.wait(timeout=wall_cap_s + 2)
        except subprocess.TimeoutExpired:
            # Pair watchdog: interaction deadlocked or the submission ran
            # away — objective wall-clock TLE (JDG-2's wall-time cap).
            _kill_pair(p_user, p_int)
            feedback_parts.append(
                "Interactive pair exceeded the "
                f"{wall_cap_s:g}s wall-clock cap (deadlock or runaway)."
            )
            return _VERDICT_TLE, 0, 0, None, _feedback(feedback_parts)

        try:
            user_rc = p_user.wait(timeout=POST_INTERACTOR_GRACE_S)
            user_killed = False
        except subprocess.TimeoutExpired:
            # The conversation is over (interactor exited); a submission
            # that still lingers gets killed — the interactor's verdict
            # stands.
            p_user.kill()
            user_rc = p_user.wait()
            user_killed = True
            feedback_parts.append(
                "Submission still running after the interactor finished "
                "(killed; interactor verdict stands)."
            )
    except FileNotFoundError:
        _kill_pair(p_user, p_int)
        return (
            _VERDICT_INTERNAL_ERROR,
            0,
            0,
            None,
            "Docker/interactor command not found.",
        )
    except OSError as e:
        _kill_pair(p_user, p_int)
        return (
            _VERDICT_INTERNAL_ERROR,
            0,
            0,
            None,
            f"Failed to spawn interactive pair: {e}",
        )

    # Daemon drain threads finish at EOF (both processes exited); join
    # briefly so the buffers below are populated deterministically.
    t_user.join(timeout=2)
    t_int.join(timeout=2)
    user_stderr = (user_stderr_buf[0] if user_stderr_buf else b"").decode(
        "utf-8", errors="replace"
    )
    int_stderr = (int_stderr_buf[0] if int_stderr_buf else b"").decode(
        "utf-8", errors="replace"
    )

    feedback_parts.append(f"Interactor STDERR:\n{int_stderr}")
    feedback_parts.append(f"Submission STDERR:\n{user_stderr}")

    cpu_ms, rss_kb = _parse_resource_line(user_stderr)

    # --- objective resource facts first ---------------------------------
    if user_rc == _TIMEOUT_EXIT:
        feedback_parts.append("Submission hit the wall-clock timeout.")
        return _VERDICT_TLE, cpu_ms, rss_kb, None, _feedback(feedback_parts)
    if rss_kb and memory_limit_kb and rss_kb > memory_limit_kb:
        feedback_parts.append(
            f"Submission used {rss_kb} KB > {memory_limit_kb} KB memory."
        )
        return _VERDICT_MLE, cpu_ms, rss_kb, None, _feedback(feedback_parts)
    if cpu_ms and time_limit_ms and cpu_ms > time_limit_ms:
        feedback_parts.append(
            f"Submission used {cpu_ms} ms > {time_limit_ms} ms CPU."
        )
        return _VERDICT_TLE, cpu_ms, rss_kb, None, _feedback(feedback_parts)
    if not user_killed and user_rc != 0:
        # Reported, never verdict-override: after the interactor closes
        # the conversation a submission may see EOF/BrokenPipe — the
        # interactor owns the verdict (documented protocol).
        feedback_parts.append(
            f"Note: submission exited with code {user_rc} after the "
            "conversation ended."
        )

    # --- interactor verdict mapping (checker protocol v2 on stderr) -----
    if int_rc == 0:
        return _VERDICT_ACCEPTED, cpu_ms, rss_kb, None, _feedback(feedback_parts)
    if int_rc == 1:
        feedback_parts.append("Interactor indicated failure (code 1).")
        return _VERDICT_WRONG_ANSWER, cpu_ms, rss_kb, None, _feedback(feedback_parts)
    if int_rc == 2:
        feedback_parts.append(
            "Interactor indicated presentation error (code 2, mapped to WA)."
        )
        return _VERDICT_WRONG_ANSWER, cpu_ms, rss_kb, None, _feedback(feedback_parts)
    if int_rc == 7:
        fraction, msg, parse_error = parse_points_payload(int_stderr)
        if parse_error is not None:
            feedback_parts.append(
                f"Invalid interactor partial-points payload: {parse_error}"
            )
            return (
                _VERDICT_INTERNAL_ERROR,
                cpu_ms,
                rss_kb,
                None,
                _feedback(feedback_parts),
            )
        if fraction == 0.0:
            feedback_parts.append("Interactor awarded zero points.")
            return (
                _VERDICT_WRONG_ANSWER,
                cpu_ms,
                rss_kb,
                0.0,
                _feedback(feedback_parts),
            )
        if msg:
            feedback_parts.append(f"Interactor message: {msg}")
        feedback_parts.append(f"Interactor awarded {fraction:.0%} of points.")
        return _VERDICT_ACCEPTED, cpu_ms, rss_kb, fraction, _feedback(feedback_parts)
    if int_rc == _TIMEOUT_EXIT:
        feedback_parts.append("Interactor timed out.")
        return _VERDICT_INTERNAL_ERROR, cpu_ms, rss_kb, None, _feedback(feedback_parts)
    feedback_parts.append(f"Interactor exited with unexpected code {int_rc}.")
    return _VERDICT_INTERNAL_ERROR, cpu_ms, rss_kb, None, _feedback(feedback_parts)


def _kill_pair(p_user, p_int) -> None:
    for proc in (p_int, p_user):
        if proc is None:
            continue
        try:
            proc.kill()
        except OSError:  # already dead
            pass


def _feedback(parts: list[str]) -> str:
    return "\n".join(parts)
