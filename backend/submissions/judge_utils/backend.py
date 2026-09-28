"""Settings-driven execution backend for the judge.

``JUDGE_BACKEND`` (a Django setting, loaded from the ``JUDGE_BACKEND``
environment variable in ``webcoder_api/settings.py``) selects how judged
commands are launched:

- ``"local"`` (default, development): the command runs directly on the host
  via :mod:`subprocess`. No Docker required. Useful for local development
  where the full toolchain is installed on the machine.
- ``"container"`` (production): the command runs inside the sandboxed
  ``judge-runner`` container (service ``judge-runner`` in the repo-root
  ``docker-compose.yml``) via ``docker exec``. That container is
  network-isolated (``network_mode: none``), has a read-only root filesystem,
  all Linux capabilities dropped, ``no-new-privileges``, and memory / CPU /
  PID limits. Submission files are exchanged through the shared ``judge-sandbox``
  volume mounted at ``/srv/judge`` in both the backend and the judge-runner.

This module is ADDITIVE: the legacy per-run ``docker run`` flow implemented in
``judge_utils/compilation.py`` and ``judge_utils/execution.py`` is untouched
and keeps working exactly as before. Nothing in this module is imported by the
legacy modules, so the existing judging flow cannot be affected by it.

Hardening contract for the container path (enforced by docker-compose.yml on
the judge-runner service, verified by submissions/tests.py):

- network isolation: ``network_mode: "none"`` (docker exec joins the
  container's network namespace, so exec'd processes have no network);
- read-only filesystem: ``read_only: true`` rootfs + writable tmpfs ``/tmp``
  and the shared sandbox volume only;
- no capabilities: ``cap_drop: ALL`` + ``security_opt: no-new-privileges``;
- resource limits: container-level ``mem_limit`` / ``cpus`` / ``pids_limit``
  bound the blast radius; per-submission limits are enforced by the caller's
  ``timeout`` argument (and by the legacy /usr/bin/time measurements).
"""

import subprocess

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

#: Run judged commands directly on this host via subprocess (development).
LOCAL = "local"
#: Run judged commands inside the sandboxed judge-runner container (production).
CONTAINER = "container"

VALID_BACKENDS = (LOCAL, CONTAINER)

#: ``container_name`` of the judge-runner service in docker-compose.yml.
#: Kept in sync with the compose file; tests assert the exec argv uses it.
JUDGE_RUNNER_CONTAINER = "webcoder-judge-runner"

#: Non-root uid:gid the judge-runner container runs as (compose ``user:``).
#: Repeated per-exec (``docker exec --user``) so a misconfigured container
#: cannot silently upgrade judged processes to another uid.
JUDGE_RUNNER_USER = "1000:1000"


def get_judge_backend() -> str:
    """Return the configured judge backend, validating it.

    Reads ``settings.JUDGE_BACKEND`` (env var ``JUDGE_BACKEND``, default
    ``"local"``). Raises ``ImproperlyConfigured`` for unknown values so a
    typo'd deployment fails loudly instead of silently judging unsandboxed.
    """
    backend = getattr(settings, "JUDGE_BACKEND", LOCAL)
    if backend not in VALID_BACKENDS:
        raise ImproperlyConfigured(
            f"JUDGE_BACKEND must be one of {VALID_BACKENDS}, got {backend!r}."
        )
    return backend


def build_command(
    command: list[str],
    backend: str | None = None,
    workdir: str | None = None,
) -> list[str]:
    """Wrap *command* for the selected backend and return the argv to run.

    - ``local``: the command is returned unchanged (run on the host as-is).
    - ``container``: wrapped in a hardened ``docker exec`` into the
      judge-runner container (``-i`` for stdin, ``-w`` when *workdir* is
      given, ``--user 1000:1000`` non-root, target container
      ``JUDGE_RUNNER_CONTAINER``).

    *workdir* is the working directory *for the judged process* — a host path
    in ``local`` mode, a path inside the judge-runner container (e.g. under
    ``/srv/judge``) in ``container`` mode.
    """
    if backend is None:
        backend = get_judge_backend()
    if backend not in VALID_BACKENDS:
        raise ImproperlyConfigured(
            f"JUDGE_BACKEND must be one of {VALID_BACKENDS}, got {backend!r}."
        )
    if backend == LOCAL:
        return list(command)
    argv = ["docker", "exec", "-i"]
    if workdir:
        argv += ["-w", workdir]
    argv += ["--user", JUDGE_RUNNER_USER, JUDGE_RUNNER_CONTAINER]
    return argv + list(command)


def run_judged_process(
    command: list[str],
    input_data: str | None = None,
    timeout: float = 30,
    cwd: str | None = None,
    backend: str | None = None,
) -> subprocess.CompletedProcess:
    """Run *command* under the selected judge backend and return the result.

    Thin dispatch over :func:`subprocess.run`:

    - ``local``: runs *command* directly on the host with ``cwd`` as the
      process working directory.
    - ``container``: runs the hardened ``docker exec`` argv produced by
      :func:`build_command`; ``cwd`` is translated to ``docker exec -w``
      (the directory inside the judge-runner container, e.g. the submission
      directory on the shared ``/srv/judge`` volume).

    Output is captured (stdout/stderr, text mode) and stdin is fed from
    *input_data* (test-case input). Raises the same exceptions as the legacy
    judge code paths — ``subprocess.TimeoutExpired`` on timeout and
    ``FileNotFoundError`` when the launcher (python/docker) is missing — so
    callers keep one uniform error contract across backends.
    """
    chosen = get_judge_backend() if backend is None else backend
    if chosen == CONTAINER:
        run_command = build_command(command, backend=chosen, workdir=cwd)
        subprocess_cwd = None  # cwd names a directory INSIDE the container.
    else:
        run_command = list(command)
        subprocess_cwd = cwd
    return subprocess.run(
        run_command,
        input=input_data,
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=subprocess_cwd,
    )
