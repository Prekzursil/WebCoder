"""Compose-stack regression guards (ops, round-2 X3/OPR wave).

The celery-beat container crash-looped on the live stack because its
compose command used ``--schedule-file`` — a flag celery 5.x's click CLI
rejects (exit 2). Nothing in the test suite could see it. These guards
read the committed compose file as text (no yaml dependency in the
backend env) so dead CLI flags in service commands fail CI instead of a
container restart loop.
"""

import pathlib
import re

COMPOSE = pathlib.Path(__file__).resolve().parents[2] / "docker-compose.yml"


def test_compose_file_exists():
    assert COMPOSE.exists(), f"missing {COMPOSE}"


def test_beat_uses_the_celery5_schedule_flag():
    text = COMPOSE.read_text(encoding="utf-8")
    beat_cmd = re.search(r'command:\s*\[([^\]]*"beat"[^\]]*)\]', text)
    assert beat_cmd is not None, "celery beat command not found in compose"
    cmd = beat_cmd.group(1)
    assert "--schedule-file" not in cmd, (
        "celery 5.x rejected --schedule-file (exit 2, crash-looped the "
        "live beat container) — use --schedule"
    )
    assert '"--schedule"' in cmd
    assert '"/tmp/celerybeat-schedule"' in cmd


def test_no_service_command_uses_the_dead_flag():
    text = COMPOSE.read_text(encoding="utf-8")
    assert '"--schedule-file"' not in text, (
        "a compose service command uses the celery-5.x-dead flag --schedule-file"
    )


# --- Real-backend e2e overlay ------------------------------------------------
#
# The nightly prod-like e2e had never been green: the Playwright suite serves
# the app on http://localhost:3311 (playwright.config.ts APP_PORT) while the
# stack serves the API on http://localhost:8000, and the backend's CORS
# allowlist only knew the plain dev server (http://localhost:3000). The
# browser therefore dropped every API response for the :3311 origin and
# never sent the login POST after its preflight. The overlay below is the fix
# (RUNBOOK § "Real-backend e2e mode"); these guards keep it wired.

E2E_OVERLAY = COMPOSE.parent / "docker-compose.e2e.yml"
PLAYWRIGHT_CONFIG = COMPOSE.parent / "playwright.config.ts"
NIGHTLY_WORKFLOW = COMPOSE.parent / ".github" / "workflows" / "e2e-nightly.yml"


def _playwright_app_port():
    """The e2e dev-server port (``APP_PORT`` in playwright.config.ts)."""
    match = re.search(
        r"^const APP_PORT = (\d+);",
        PLAYWRIGHT_CONFIG.read_text(encoding="utf-8"),
        re.MULTILINE,
    )
    assert match is not None, "APP_PORT not found in playwright.config.ts"
    return int(match.group(1))


def test_e2e_overlay_allows_the_playwright_dev_server_origin():
    """The overlay must allowlist exactly the origin the app is served from.

    CORS is origin-exact (scheme://host:port), so an overlay that drifts from
    ``APP_PORT`` is silently useless: the browser rejects the response the
    same way it does with no allowlist at all.
    """
    assert E2E_OVERLAY.exists(), f"missing {E2E_OVERLAY}"
    expected = f"CORS_ALLOWED_ORIGINS: http://localhost:{_playwright_app_port()}"
    assert expected in E2E_OVERLAY.read_text(encoding="utf-8"), (
        f"{E2E_OVERLAY.name} must allowlist the dev-server origin ({expected})"
    )


def test_nightly_brings_up_the_stack_with_the_e2e_overlay():
    """The nightly must run the stack with the overlay, or CORS bites again."""
    match = re.search(
        r"^\s*COMPOSE_FILE:\s*(\S+)\s*$",
        NIGHTLY_WORKFLOW.read_text(encoding="utf-8"),
        re.MULTILINE,
    )
    assert match is not None, "the nightly workflow does not set COMPOSE_FILE"
    files = match.group(1).split(":")
    assert files == ["docker-compose.yml", "docker-compose.e2e.yml"]


def _docker_compose_commands(workflow):
    """Logical ``docker compose ...`` shell lines (backslash continuations joined)."""
    joined = re.sub(r"\\\n\s*", " ", workflow)
    return [
        line.strip()
        for line in joined.splitlines()
        if line.strip().startswith("docker compose ")
    ]


def test_nightly_compose_calls_do_not_override_compose_file():
    """An explicit ``-f`` beats COMPOSE_FILE.

    The first run after the overlay landed still failed with the CORS
    signature: ``docker compose -f docker-compose.yml up -d`` came up without
    the overlay because a file flag replaces the COMPOSE_FILE list. Every
    compose call in the workflow must take its file set from COMPOSE_FILE.
    """
    commands = _docker_compose_commands(NIGHTLY_WORKFLOW.read_text(encoding="utf-8"))
    assert len(commands) >= 4, (
        f"expected the stack lifecycle calls, found {len(commands)}"
    )
    for command in commands:
        flags = [
            token
            for token in command.split()
            if token == "-f" or token.startswith("--file")
        ]
        assert not flags, f"`{command}` overrides COMPOSE_FILE with {flags}"
