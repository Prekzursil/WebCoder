"""Settings-driven execution backend for the judge — THE production path.

``JUDGE_BACKEND`` (a Django setting, loaded from the ``JUDGE_BACKEND``
environment variable in ``webcoder_api/settings.py``) selects how judged
commands are launched:

- ``"container"`` (production): the command runs inside the sandboxed
  ``judge-runner`` container (service ``judge-runner`` in the repo-root
  ``docker-compose.yml``, container name ``webcoder-judge-runner``) via
  ``docker exec``. That container is network-isolated (``network_mode:
  none``), has a read-only root filesystem, all Linux capabilities dropped,
  ``no-new-privileges``, and memory / CPU / PID limits. Submission files are
  exchanged through the shared ``judge-sandbox`` volume mounted at
  ``/srv/judge`` in both the worker and the judge-runner, so per-submission
  workspace paths are IDENTICAL on both sides and no host bind-mounts are
  involved (the flaw that broke the legacy per-run ``docker run`` flow when
  the Celery worker itself runs as a container: its ``/tmp/...`` workspace
  paths do not exist on the Docker host).
- ``"local"`` (default, host development): the command runs through a per-run
  ``docker run`` that bind-mounts the submission directory from the host.
  This only works when the Celery worker runs directly on the Docker host
  (classic dev setup); it is NOT the production path. Per-run images come
  from :mod:`submissions.judge_utils.languages`.

This module is the single spawn point for the judge pipeline:
``compilation.py``, ``execution.py`` and ``checkers.py`` build language
argv from the registry and hand them to :func:`run_judged_process` /
:func:`build_docker_run_command` here.

Hardening contract for the container path (enforced by docker-compose.yml on
the judge-runner service, verified by submissions/tests.py):

- network isolation: ``network_mode: "none"`` (docker exec joins the
  container's network namespace, so exec'd processes have no network);
- read-only filesystem: ``read_only: true`` rootfs + writable tmpfs ``/tmp``
  and the shared sandbox volume only;
- no capabilities: ``cap_drop: ALL`` + ``security_opt: no-new-privileges``;
- resource limits: container-level ``mem_limit`` / ``cpus`` / ``pids_limit``
  bound the blast radius; per-submission limits are enforced by the caller's
  ``timeout`` argument and the ``/usr/bin/time`` measurements (see
  ``execution.py``).
"""

import pathlib
import subprocess
import tempfile

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

#: Run judged commands through per-run ``docker run`` on this host (dev).
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

#: Mount point of the shared judge-sandbox volume — identical inside the
#: Celery worker and the judge-runner (docker-compose.yml mounts
#: ``judge-sandbox:/srv/judge`` on both), which is what makes workspace paths
#: portable between them.
DEFAULT_JUDGE_SANDBOX_ROOT = "/srv/judge"

#: Hardening flags every per-run ``docker run`` (local backend) carries.
#: Network isolation is appended separately (see ``build_docker_run_command``).
_DOCKER_RUN_HARDENING = (
    "--rm",
    "--user",
    "1000:1000",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
)


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


def judge_workspace_root() -> pathlib.Path:
    """Directory under which per-submission workspaces are created.

    - ``container``: ``settings.JUDGE_SANDBOX_ROOT`` (default ``/srv/judge``,
      the shared judge-sandbox volume). Workspaces created under it are
      visible at the exact same path inside the judge-runner container, so
      ``docker exec`` can compile/run them without any host bind-mount.
    - ``local``: the system temporary directory (bind-mounted per-run by
      ``docker run`` from the host).
    """
    if get_judge_backend() == CONTAINER:
        root = pathlib.Path(
            getattr(settings, "JUDGE_SANDBOX_ROOT", DEFAULT_JUDGE_SANDBOX_ROOT)
        )
        return root
    return pathlib.Path(
        getattr(settings, "JUDGE_LOCAL_WORKSPACE_ROOT", "") or _system_temp_root()
    )


def _system_temp_root() -> str:
    return tempfile.gettempdir()


def build_command(
    command: list[str],
    backend: str | None = None,
    workdir: str | None = None,
) -> list[str]:
    """Wrap *command* for the selected backend and return the argv to run.

    - ``local``: the command is returned unchanged (run on the host as-is —
      used by tests and direct-subprocess dev flows).
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


def build_docker_run_command(
    command: list[str],
    bind_dir: str,
    docker_image: str,
    memory_limit_kb: int | None = None,
    extra_volume_mounts: list[str] | None = None,
    mount_mode: str = "ro",
    interactive: bool = True,
    network: str = "none",
) -> list[str]:
    """Build the per-run ``docker run`` argv for the LOCAL (host dev) backend.

    Bind-mounts *bind_dir* (the submission workspace on the host) at ``/app``
    and runs *docker_image* with the same hardening flags the production
    judge-runner carries (``--rm``, non-root, cap-drop ALL,
    no-new-privileges, ``--network none``). Only meaningful when the worker
    runs on the Docker host; the container backend never bind-mounts.

    *network* stays ``"none"`` for every judged run; the only legacy caller
    override is the python custom-libs pip flow (local backend), which needs
    egress for ``pip install``. The production exec path is unconditionally
    network-isolated (compose ``network_mode: none``).
    """
    argv = ["docker", "run", *_DOCKER_RUN_HARDENING, "--network", network]
    if interactive:
        argv.append("-i")
    if memory_limit_kb and memory_limit_kb > 0:
        argv += [
            "--memory",
            f"{memory_limit_kb}k",
            "--memory-swap",
            f"{memory_limit_kb}k",
        ]
    argv += ["-v", f"{bind_dir}:/app:{mount_mode}", "-w", "/app", docker_image]
    if extra_volume_mounts:
        argv += list(extra_volume_mounts)
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
