#!/usr/bin/env python
"""OPR-4 (round-2): the synthetic contest-submission replay gate.

The round-2 capacity gate for the FIRST RATED CONTEST: 50 concurrent
submitters, p95 judge wait < 20 s. This harness drives the real stack
over HTTP — real registrations/participations, real submissions, real
celery judge lane — and prints the latency report plus a PASS/FAIL
verdict against the numeric gate.

Stdlib-only (urllib + threading), mirroring scripts/load_smoke.py.
Creates real rows (one user + N submissions per virtual user) — point
it at the local stack only.

Prerequisites:
  * a contest created on the target stack whose window is OPEN, with at
    least one APPROVED problem that a trivial python3 solution ACs (the
    seeded "A+B" problems qualify);
  * an admin API token or credentials to mint the probe users.

The target stack comes from WEBCODER_BASE_URL (default
http://127.0.0.1:8010) — an operator-set environment origin, kept out of
argv so the request target is never a raw command-line string.

Usage:
  WEBCODER_BASE_URL=http://127.0.0.1:8010 \
  python scripts/contest_replay.py --contest 7 --users 30 --per-user 3 \
      --admin-username admin --admin-password '...'

Exit code 0 = gate passed, 1 = gate failed, 2 = harness/setup error.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import statistics
import string
import sys
import threading
import time
import urllib.error
import urllib.request

SOLUTION = "print(int(input()) + int(input()))\n"
#: The round-2 OPR-4 numeric gate.
GATE_P95_SECONDS = 20.0
GATE_MIN_USERS = 50  # the full gate; the harness allows fewer for rehearsal


def validated_base(base: str) -> str:
    """Operator rail: the target must be an explicit http(s) origin.

    The harness talks to whatever WEBCODER_BASE_URL says; requiring a
    scheme with no userinfo keeps a typo'd or hostile value from being
    silently interpreted (urllib accepts file:// and ftp:// too).
    """
    from urllib.parse import urlsplit

    parts = urlsplit(base)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise SystemExit(
            f"WEBCODER_BASE_URL must be an http(s) origin, got {base!r}"
        )
    if parts.username or parts.password:
        raise SystemExit("WEBCODER_BASE_URL must not carry credentials")
    return base.rstrip("/")


class Api:
    def __init__(self, base: str):
        self.base = validated_base(base)

    def _call(self, method: str, path: str, body: dict | None = None,
              token: str | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            self.base + path, data=data, method=method,
            headers={"Content-Type": "application/json"},
        )
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}

    def login(self, username: str, password: str) -> str:
        # dj-rest-auth JWT login (the stack's auth lane): the access
        # token rides the Authorization: Bearer header thereafter.
        resp = self._call("POST", "/api/v1/auth/login/",
                          {"username": username, "password": password})
        return resp["access_token"]

    def register(self, username: str, password: str) -> None:
        self._call("POST", "/api/v1/users/register/", {
            "username": username,
            "email": f"{username}@example.com",
            "password": password,
            "password2": password,
        })


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contest", type=int, required=True)
    parser.add_argument("--users", type=int, default=50)
    parser.add_argument("--per-user", type=int, default=2,
                        help="submissions per virtual user")
    parser.add_argument("--problem", type=int, default=None,
                        help="contest problem id (default: first board problem)")
    parser.add_argument("--admin-username", required=True)
    parser.add_argument("--admin-password", required=True)
    parser.add_argument("--poll-interval", type=float, default=1.0)
    args = parser.parse_args()

    api = Api(os.environ.get("WEBCODER_BASE_URL", "http://127.0.0.1:8010"))
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    password = f"Replay-{suffix}-2026!"

    users: list[tuple[str, str]] = []
    for i in range(args.users):
        username = f"replay_{suffix}_{i}"
        try:
            api.register(username, password)
        except urllib.error.HTTPError as exc:  # rehearsal reruns etc.
            print(f"[setup] register {username}: {exc.code} (continuing)", file=sys.stderr)
        token = api.login(username, password)
        users.append((username, token))

    # Discover a board problem + register every probe user for the contest.
    board = api._call("GET", f"/api/v1/contests/{args.contest}/problems/")
    problems = board if isinstance(board, list) else board.get("results", [])
    if not problems:
        print("[setup] no problems visible on the contest board", file=sys.stderr)
        return 2
    problem_id = args.problem or problems[0]["problem"]["id"]
    for username, token in users:
        try:
            api._call("POST", f"/api/v1/contests/{args.contest}/register/",
                      {}, token=token)
        except urllib.error.HTTPError as exc:
            print(f"[setup] register {username} for contest: {exc.code}", file=sys.stderr)

    waits: list[float] = []
    errors: list[str] = []
    lock = threading.Lock()

    def worker(username: str, token: str) -> None:
        local_waits: list[float] = []
        local_errors: list[str] = []
        for _ in range(args.per_user):
            start = time.monotonic()
            try:
                created = api._call(
                    "POST", "/api/v1/submissions/",
                    {"problem": problem_id, "language": "python3",
                     "code": SOLUTION, "contest": args.contest},
                    token=token,
                )
                sid = created.get("id")
                verdict = None
                while time.monotonic() - start < 120:
                    time.sleep(args.poll_interval)
                    detail = api._call("GET", f"/api/v1/submissions/{sid}/",
                                       token=token)
                    verdict = detail.get("verdict")
                    if verdict not in (None, "COMPILING", "RUNNING", "QUEUED",
                                       "IN_QUEUE"):
                        break
                else:
                    local_errors.append(f"{username}: timeout waiting verdict")
                    continue
                if verdict != "ACCEPTED":
                    local_errors.append(f"{username}: unexpected verdict {verdict}")
                local_waits.append(time.monotonic() - start)
            except Exception as exc:  # noqa: BLE001 - report and continue
                local_errors.append(f"{username}: {exc}")
        with lock:
            waits.extend(local_waits)
            errors.extend(local_errors)

    threads = [threading.Thread(target=worker, args=(u, t)) for u, t in users]
    started = time.monotonic()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    wall = time.monotonic() - started

    if not waits:
        print("FAIL: no completed submissions", file=sys.stderr)
        for e in errors[:10]:
            print("  ", e, file=sys.stderr)
        return 1

    waits.sort()
    p50 = waits[len(waits) // 2]
    p95 = waits[int(len(waits) * 0.95) - 1] if len(waits) >= 20 else waits[-1]
    print(f"contest replay: {len(waits)} judged submissions "
          f"({args.users} users x {args.per_user}), wall {wall:.1f}s")
    print(f"  judge wait p50 {p50:.2f}s  p95 {p95:.2f}s  "
          f"max {waits[-1]:.2f}s  errors {len(errors)}")
    for e in errors[:10]:
        print("  ", e, file=sys.stderr)

    passed = p95 < GATE_P95_SECONDS and not errors
    if args.users < GATE_MIN_USERS:
        print(f"  NOTE: rehearsal scale ({args.users} < {GATE_MIN_USERS} users) "
              f"— the full gate needs {GATE_MIN_USERS} concurrent submitters.")
    print("GATE:", "PASS" if passed else "FAIL",
          f"(p95 < {GATE_P95_SECONDS:g}s and zero errors)")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
