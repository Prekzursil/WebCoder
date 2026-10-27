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
    beat_cmd = re.search(
        r'command:\s*\[([^\]]*"beat"[^\]]*)\]', text
    )
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
        "a compose service command uses the celery-5.x-dead flag "
        "--schedule-file"
    )
