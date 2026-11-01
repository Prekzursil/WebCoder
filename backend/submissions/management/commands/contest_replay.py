"""OPR-4 (round-2): the synthetic contest-submission replay gate.

The numeric gate for the FIRST RATED CONTEST: 50 concurrent submitters,
p95 judge wait < 20 s, zero unexpected verdicts. This command drives the
REAL stack in-process — real users, real contest participations, real
submissions dispatched through the celery judge lane (delay() → worker →
sandbox) — then reports the wait distribution and the PASS/FAIL verdict.

Run it against the live stack (backend venv or the API container):

    python manage.py contest_replay --contest 7 --users 50 --per-user 2

Submissions use a trivial python3 solution against the contest's first
board problem — point it at a contest whose window is OPEN and whose
first problem a trivial A+B-style solution ACs (the seeded ladder
problems qualify). Creates real rows (``replay_<run>_`` users); clean
them afterwards via the admin users view — they exist only as probes.

Exit code 0 = gate passed, 1 = gate failed (also printed).
"""

from __future__ import annotations

import random
import string
import time
from concurrent.futures import ThreadPoolExecutor

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from contests.models import Contest, ContestParticipation, ContestProblem
from submissions.models import Submission
from submissions.tasks import judge_submission_task
from users.models import User

#: The round-2 OPR-4 numeric gate.
GATE_P95_SECONDS = 20.0
GATE_MIN_USERS = 50  # the full gate; the command allows fewer for rehearsal

SOLUTION = "print(int(input()) + int(input()))\n"
TERMINAL = {
    verdict.value
    for verdict in Submission.VerdictStatus
    if verdict.value not in ("PENDING", "COMPILING", "RUNNING")
}


class Command(BaseCommand):
    help = (
        "OPR-4 replay gate: synthetic contest submissions through the real "
        "judge lane; reports judge-wait p50/p95 against the 20s gate."
    )

    def add_arguments(self, parser):
        parser.add_argument("--contest", type=int, required=True)
        parser.add_argument("--users", type=int, default=GATE_MIN_USERS)
        parser.add_argument("--per-user", type=int, default=2)
        parser.add_argument(
            "--concurrency",
            type=int,
            default=None,
            help="parallel submitters (default: all; lower it on sqlite)",
        )
        parser.add_argument("--poll-interval", type=float, default=1.0)
        parser.add_argument(
            "--timeout",
            type=float,
            default=120.0,
            help="per-submission verdict wait ceiling (seconds)",
        )

    def handle(self, *args, **options):
        contest = Contest.objects.filter(pk=options["contest"]).first()
        if contest is None:
            raise CommandError(f"contest {options['contest']} does not exist")
        board_problem = (
            ContestProblem.objects.filter(contest=contest)
            .select_related("problem")
            .order_by("order")
            .first()
        )
        if board_problem is None:
            raise CommandError(f"contest {options['contest']} has no problems")

        suffix = "".join(random.choices(string.ascii_lowercase, k=6))
        password = f"Replay-{suffix}-2026!"
        probes: list[User] = []
        for i in range(options["users"]):
            probes.append(
                User.objects.create_user(
                    username=f"replay_{suffix}_{i}",
                    password=password,
                    email=f"replay_{suffix}_{i}@example.com",
                )
            )
        for user in probes:
            ContestParticipation.objects.get_or_create(contest=contest, user=user)

        waits: list[float] = []
        errors: list[str] = []

        def one_user(user: User) -> tuple[list[float], list[str]]:
            close_old_connections()
            local_waits: list[float] = []
            local_errors: list[str] = []
            for _ in range(options["per_user"]):
                start = time.monotonic()
                submission = Submission.objects.create(
                    user=user,
                    problem=board_problem.problem,
                    language="python3",
                    code=SOLUTION,
                    contest=contest,
                )
                judge_submission_task.delay(submission.id)
                verdict = None
                while time.monotonic() - start < options["timeout"]:
                    time.sleep(options["poll_interval"])
                    fresh = Submission.objects.filter(pk=submission.pk).first()
                    if fresh is None:  # pragma: no cover - concurrent delete race
                        local_errors.append(f"{user.username}: submission vanished")
                        break
                    verdict = fresh.verdict
                    if verdict in TERMINAL:
                        break
                else:
                    local_errors.append(f"{user.username}: timeout waiting verdict")
                    continue
                if verdict != Submission.VerdictStatus.ACCEPTED:
                    local_errors.append(f"{user.username}: verdict {verdict}")
                local_waits.append(time.monotonic() - start)
            return local_waits, local_errors

        workers = options["concurrency"] or options["users"]
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for local_waits, local_errors in pool.map(one_user, probes):
                waits.extend(local_waits)
                errors.extend(local_errors)

        if not waits:
            self.stderr.write("contest replay: FAIL — no completed submissions")
            for line in errors[:10]:
                self.stderr.write(f"  {line}")
            raise SystemExit(1)

        waits.sort()
        p50 = waits[len(waits) // 2]
        p95 = waits[int(len(waits) * 0.95) - 1] if len(waits) >= 20 else waits[-1]
        self.stdout.write(
            f"contest replay: {len(waits)} judged submissions "
            f"({options['users']} users x {options['per_user']})"
        )
        self.stdout.write(
            f"  judge wait p50 {p50:.2f}s  p95 {p95:.2f}s  max {waits[-1]:.2f}s  "
            f"errors {len(errors)}"
        )
        for line in errors[:10]:
            self.stderr.write(f"  {line}")
        if options["users"] < GATE_MIN_USERS:
            self.stdout.write(
                f"  NOTE: rehearsal scale ({options['users']} < {GATE_MIN_USERS} "
                f"users) — the full gate needs {GATE_MIN_USERS} submitters."
            )
        passed = p95 < GATE_P95_SECONDS and not errors
        self.stdout.write(
            f"GATE: {'PASS' if passed else 'FAIL'} "
            f"(p95 < {GATE_P95_SECONDS:g}s and zero errors)"
        )
        if not passed:
            raise SystemExit(1)
