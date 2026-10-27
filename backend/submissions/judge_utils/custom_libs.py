"""Custom-library installation for the judge (SPEC-GAPS J3 / E1, v1 G9).

The python3 ``custom_libraries_allowed`` feature used to run
``pip install`` INSIDE the judged run container with full Docker bridge
networking and an ``rw`` submission mount (SECURITY-AUDIT-judge.md J1 —
unrestricted egress from user-controlled code plus verbatim
attacker-authored requirement lines). This module implements the split
replacement:

- **Requirement allowlist**: every ``custom_libraries_allowed`` entry must
  match ``ALLOWLIST_RE`` (name with optional ``==version``; no URLs, VCS
  specifiers, paths, extras, environment markers, or options). Rejected
  entries fail the submission with a user-facing "disallowed library
  specifier" error — both at submit time (serializer) and again at judge
  time (defense in depth).
- **Install once, run sandboxed**: ``install_custom_libs`` runs ONE pip
  container per submission (not per test case) that installs into
  ``<submission_dir>/libs`` via ``pip --target`` so the packages persist in
  the submission workspace for all later runs. The judged runs themselves
  (``execution.py``) are now ALWAYS ``--network none`` with a read-only
  submission mount; the run command just points ``PYTHONPATH`` at ``libs``.
- **Fail-closed egress**: the install container's network comes from the
  ``JUDGE_PIP_NETWORK`` setting (default ``none``) — with no network pip
  cannot fetch anything and the submission fails closed with a clear
  message. Operators who want the feature provision an internal
  ``judge-build`` network whose only egress member is a PyPI allowlist
  proxy (see docs/RUNBOOK.md §judge-pip-egress): set
  ``JUDGE_PIP_NETWORK=judge-build`` (+ optional ``JUDGE_PYPI_INDEX_URL``)
  to enable it. The judged runs never gain egress either way.
"""

import pathlib
import re
import subprocess

from django.conf import settings

from .languages import get_language

#: Strict pip-requirement allowlist (SPEC-GAPS D-J3 part 2): a package name
#: (letters/digits/./-/_ , not starting/ending with a separator) with an
#: OPTIONAL pinned ``==version``. Everything else — VCS URLs (``git+https``),
#: plain URLs, paths, ``-e .``, extras (``pkg[extra]``), ``>=``/``~=`` ranges,
#: ``--hash``/``--index-url`` options, environment markers — is rejected.
ALLOWLIST_RE = re.compile(
    r"[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?(==[A-Za-z0-9.+!-]+)?"
)

#: Where ``pip install --target`` puts the packages, relative to the
#: submission workspace (identical path on both judge backends).
LIBS_DIR_NAME = "libs"

#: pip stderr markers that distinguish "cannot resolve requirement" from
#: other pip failures (surfaced to the submitter as a library error).
PIP_ERROR_KEYWORDS = [
    "ERROR: Could not find a version that satisfies the requirement",
    "ERROR: No matching distribution found for",
]


def is_allowed_requirement(entry: str) -> bool:
    """True when *entry* is an allowlisted pip requirement specifier."""
    return isinstance(entry, str) and ALLOWLIST_RE.fullmatch(entry) is not None


def validate_requirements(libs: list[str] | None) -> list[str]:
    """Return the validated requirement list or raise ``ValueError``.

    Every entry must pass :data:`ALLOWLIST_RE`. The error message names the
    first offending specifier and is safe to surface to the submitter.
    """
    for entry in libs or []:
        if not is_allowed_requirement(entry):
            raise ValueError(f"disallowed library specifier: {entry!r}")
    return list(libs or [])


def install_custom_libs(
    submission_dir: pathlib.Path,
    libs: list[str] | None,
) -> tuple[bool, str]:
    """Install the problem's custom libraries ONCE per submission.

    Writes ``requirements_custom.txt`` (allowlist-validated) into
    *submission_dir* and runs pip in a one-shot hardened container that
    installs into ``<submission_dir>/libs``:

    - local backend: ``docker run`` bind-mounting the submission dir (the
      ONLY phase that ever mounts it writable), image from the language
      registry;
    - container backend: same one-shot ``docker run`` but mounting the
      shared judge-sandbox *volume* by name (``JUDGE_SANDBOX_VOLUME``) at
      ``/srv/judge`` so the workspace path matches the worker's.

    Network egress is controlled by ``JUDGE_PIP_NETWORK`` (default
    ``none``): without an operator-provisioned egress path pip fails closed.
    Returns ``(True, output)`` on success, ``(False, user_message)`` on
    failure (allowlist violation, missing toolchain, or pip failure).
    """
    try:
        requirements = validate_requirements(libs)
    except ValueError as exc:
        return False, str(exc)
    if not requirements:
        return True, ""

    spec = get_language("python3")
    if spec is None:  # pragma: no cover — python3 is a registry constant
        return False, "python3 toolchain unavailable on this judge."

    requirements_file = submission_dir / "requirements_custom.txt"
    requirements_file.write_text("\n".join(requirements) + "\n", encoding="utf-8")

    pip_cmd = [
        "pip",
        "install",
        "--no-cache-dir",
        "--disable-pip-version-check",
        f"--target={LIBS_DIR_NAME}",
        "-r",
        requirements_file.name,
        "--timeout",
        "20",
        "--retries",
        "1",
    ]
    index_url = getattr(settings, "JUDGE_PYPI_INDEX_URL", "")
    if index_url:
        pip_cmd += ["-i", index_url]

    backend_local_root = _install_bind_root(submission_dir)
    if backend_local_root is None:
        return False, (
            "Custom Python libraries require the shared judge-sandbox volume "
            "(JUDGE_SANDBOX_VOLUME) on the container judge backend; it is not "
            "configured, so the install fails closed."
        )

    argv = [
        "docker",
        "run",
        "--rm",
        "--user",
        "1000:1000",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        # The ONLY judge-spawned container with any network; default none
        # (fail closed) — operators provision the judge-build network +
        # PyPI proxy to enable pip egress (RUNBOOK §judge-pip-egress).
        "--network",
        getattr(settings, "JUDGE_PIP_NETWORK", "none"),
        "--memory",
        "512m",
        "--memory-swap",
        "512m",
        "--pids-limit",
        "64",
        "-v",
        backend_local_root,
        "-w",
        str(_install_workdir(submission_dir)),
        spec.docker_image,
        *pip_cmd,
    ]

    print(f"Installing custom libraries: {' '.join(argv)}")
    try:
        result = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=180,
        )
    except FileNotFoundError:
        return False, "Docker command not found; cannot install custom libraries."
    except subprocess.TimeoutExpired:
        return False, "Custom library installation timed out."

    if result.returncode != 0:
        stderr = (result.stderr or result.stdout or "").strip()
        print(f"Custom library install failed ({result.returncode}): {stderr[:2000]}")
        if "network" in stderr.lower() or "--network none" in stderr:
            return False, (
                "Custom Python libraries are unavailable on this judge: the "
                "install step has no network egress (fail closed)."
            )
        if any(kw in stderr for kw in PIP_ERROR_KEYWORDS):
            return False, f"Python Library Install Error:\n{stderr}"
        return False, f"Custom library installation failed:\n{stderr[:4000]}"

    return True, (result.stdout or "").strip()


def _install_bind_root(submission_dir: pathlib.Path) -> str | None:
    """The ``-v`` source[:target] mount spec for the install container.

    Local backend: the host submission dir bind-mounted at the SAME absolute
    path (host dev runs the worker on the Docker host, so the path is valid
    there). Container backend: the shared judge-sandbox named volume mounted
    at ``/srv/judge`` (``JUDGE_SANDBOX_VOLUME`` must be configured by the
    deployment). Returns None when the container backend cannot mount.
    """
    from .backend import CONTAINER, get_judge_backend

    if get_judge_backend() == CONTAINER:
        volume = getattr(settings, "JUDGE_SANDBOX_VOLUME", "")
        if not volume:
            return None
        return f"{volume}:{getattr(settings, 'JUDGE_SANDBOX_ROOT', '/srv/judge')}:rw"
    return f"{str(submission_dir.resolve())}:{str(submission_dir)}:rw"


def _install_workdir(submission_dir: pathlib.Path) -> pathlib.Path:
    """Working directory for the install container = the submission dir."""
    return submission_dir
