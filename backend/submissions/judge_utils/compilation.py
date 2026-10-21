"""Compile a submitted solution inside the judge sandbox.

The per-language compile knowledge lives in
:mod:`submissions.judge_utils.languages` (the registry). This module writes
the submitted source into the submission workspace, runs the registry's
compile argv under the configured judge backend
(:mod:`submissions.judge_utils.backend`) — ``docker exec`` into the hardened
judge-runner for ``JUDGE_BACKEND=container`` (production), a per-run
``docker run`` for ``JUDGE_BACKEND=local`` (host dev) — and verifies the
compile artifact exists in the shared workspace.
"""

import pathlib
import subprocess

from django.conf import settings

from .backend import (
    CONTAINER,
    build_command,
    build_docker_run_command,
    get_judge_backend,
)
from .languages import get_language

# CONTAINER_BOOST_INCLUDE_PATH is the target path of the (local-backend-only)
# Boost headers bind-mount inside the per-run compile container.
CONTAINER_BOOST_INCLUDE_PATH = "/usr/local/include/boost_custom"

#: In-container compile deadline (coreutils ``timeout``, SIGKILL on expiry).
#: The host-side subprocess timeout below is a backstop that also kills the
#: docker client, so a wedged compile can never outlive COMPILE_TIMEOUT_S by
#: more than a factor of two.
COMPILE_TIMEOUT_S = 30

#: Host-side backstop: docker client kill window (>= in-container deadline).
COMPILE_HOST_TIMEOUT_S = COMPILE_TIMEOUT_S * 2


def run_compile_step(
    compile_argv: list[str],
    workdir: pathlib.Path,
    docker_image: str,
    extra_volume_mounts: list[str] | None = None,
) -> tuple[bool, str]:
    """Run one compile argv in the sandbox and report (ok, output).

    Shared by submission compilation (below) and custom-checker compilation
    (``checkers.py``). The argv is wrapped in an in-container
    ``timeout --signal=SIGKILL`` so a wedged compiler is killed inside the
    sandbox, not just at the host-side docker client.
    """
    wrapped_command = [
        "timeout",
        "--signal=SIGKILL",
        f"{COMPILE_TIMEOUT_S}s",
        *compile_argv,
    ]
    if get_judge_backend() == CONTAINER:
        argv = build_command(
            wrapped_command, backend=CONTAINER, workdir=str(workdir)
        )
    else:
        argv = build_docker_run_command(
            wrapped_command,
            bind_dir=str(workdir.resolve()),
            docker_image=docker_image,
            extra_volume_mounts=extra_volume_mounts,
        )
    print(f"Executing compile command: {' '.join(argv)}")
    try:
        result = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=COMPILE_HOST_TIMEOUT_S,
        )
        output = f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return (
            False,
            f"Compilation timed out (>{COMPILE_HOST_TIMEOUT_S}s).",
        )
    except FileNotFoundError:
        return False, "Docker command not found for compilation."
    except Exception as e:
        return False, f"Compilation system error: {str(e)}"


def compile_code_in_sandbox(
    source_code: str,
    language: str,
    submission_dir: pathlib.Path,
    custom_libraries_allowed: list[str] | None = None,
):
    """
    Compiles code in the judge sandbox.
    Returns: (compile_success: bool, compiler_output: str, executable_path: str | None)
    """
    print(
        f"Attempting to compile code for language: {language} in dir {submission_dir}..."
    )
    if custom_libraries_allowed is None:
        custom_libraries_allowed = []

    spec = get_language(language)
    if spec is None:
        return False, f"Unsupported language for compilation: {language}", None

    source_file = submission_dir / spec.source_filename
    with open(source_file, "w") as f:
        f.write(source_code)

    if spec.compile_command is None:
        return (
            True,
            f"{spec.display_name} code - written to file, no compilation needed.",
            str(source_file),
        )

    compile_argv = list(spec.compile_argv() or ())
    extra_volume_mounts: list[str] = []

    # Boost headers for C++ (LOCAL backend only: the bind-mount of a host
    # directory does not exist in the hardened judge-runner).
    if language == "cpp17" and "boost_headers" in custom_libraries_allowed:
        if get_judge_backend() == CONTAINER:
            print(
                "Warning: boost_headers requested but the container judge "
                "backend has no host mounts; compiling without Boost."
            )
        else:
            host_boost_path = settings.JUDGE_BOOST_HEADERS_PATH
            if host_boost_path and pathlib.Path(host_boost_path).exists():
                print(f"Boost headers requested. Mounting from {host_boost_path}")
                extra_volume_mounts.extend(
                    ["-v", f"{host_boost_path}:{CONTAINER_BOOST_INCLUDE_PATH}:ro"]
                )
                compile_argv.insert(1, f"-I{CONTAINER_BOOST_INCLUDE_PATH}")
            elif host_boost_path:
                print(
                    f"Warning: Boost headers requested, but configured path "
                    f"'{host_boost_path}' does not exist on the host. "
                    f"Compilation may fail if Boost is used."
                )
            else:
                print(
                    "Warning: Boost headers requested, but "
                    "JUDGE_BOOST_HEADERS_PATH is not configured in settings. "
                    "Compilation may fail if Boost is used."
                )

    compile_ok, compiler_output = run_compile_step(
        compile_argv,
        workdir=submission_dir,
        docker_image=spec.docker_image,
        extra_volume_mounts=extra_volume_mounts,
    )
    artifact_on_host = (
        submission_dir / spec.compile_artifact if spec.compile_artifact else None
    )
    if compile_ok and artifact_on_host is not None and artifact_on_host.exists():
        return (
            True,
            f"{spec.display_name} compilation successful.\n{compiler_output}",
            str(artifact_on_host),
        )
    return (
        False,
        f"{spec.display_name} compilation failed.\n{compiler_output}",
        None,
    )
