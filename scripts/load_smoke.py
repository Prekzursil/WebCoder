#!/usr/bin/env python
"""Load/uptime smoke for the local WebCoder stack (round-2 X3 / RUNBOOK).

Stdlib-only (urllib + threading) so it runs with any Python the operator
has; no repo dependencies. Two modes:

  read load (default):
      N concurrent virtual users hammering the paginated catalog +
      healthz/readyz for a fixed request count; reports p50/p95/max
      latency, throughput and error count.

  --judge (opt-in, touches the real judge pipeline):
      log in as a probe user, submit one trivial python3 solution to a
      seeded problem and poll until a terminal verdict; reports the
      end-to-end judge round-trip latency. Creates real rows — point it at
      the local stack only.

Exit code is non-zero when any request errored or (in --judge mode) the
verdict never became terminal.

Usage:
  python scripts/load_smoke.py --base http://127.0.0.1:8010 \
      --users 10 --requests 30 [--judge --username bob --password '...']
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import threading
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar

TERMINAL_VERDICTS = {
    "AC",
    "WA",
    "TLE",
    "MLE",
    "CE",
    "RE",
    "IE",
    "COMPILATION_ERROR",
    "WRONG_ANSWER",
    "TIME_LIMIT_EXCEEDED",
    "MEMORY_LIMIT_EXCEEDED",
    "RUNTIME_ERROR",
    "INTERNAL_ERROR",
}


def http(
    url: str,
    *,
    data: dict | None = None,
    jar: CookieJar | None = None,
    timeout: float = 15.0,
):
    """GET/POST helper returning (status, parsed-json-or-raw-text)."""
    req = urllib.request.Request(url)
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        req.add_header("Content-Type", "application/json")
        # Double-submit CSRF (SP1 cookie-JWT): unsafe methods must echo the
        # csrftoken cookie value in the header.
        if jar is not None:
            token = next((c.value for c in jar if c.name == "csrftoken"), None)
            if token:
                req.add_header("X-CSRFToken", token)
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar)
        if jar is not None  # NB: an EMPTY CookieJar is falsy (__len__ == 0) —
        else urllib.request.HTTPHandler()  # test with `is not None`, never truthiness.
    )
    start = time.perf_counter()
    try:
        with opener.open(req, body, timeout=timeout) as resp:
            raw = resp.read()
            elapsed = time.perf_counter() - start
            try:
                return resp.status, json.loads(raw), elapsed
            except json.JSONDecodeError:
                return resp.status, raw.decode("utf-8", "replace"), elapsed
    except urllib.error.HTTPError as exc:
        elapsed = time.perf_counter() - start
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw), elapsed
        except json.JSONDecodeError:
            return exc.code, raw, elapsed
    except Exception as exc:  # connection refused, timeout, ...
        elapsed = time.perf_counter() - start
        return -1, f"{type(exc).__name__}: {exc}", elapsed


def percentiles(latencies: list[float]) -> str:
    if not latencies:
        return "n=0"
    ordered = sorted(latencies)
    p50 = ordered[int(0.50 * (len(ordered) - 1))]
    p95 = ordered[int(0.95 * (len(ordered) - 1))]
    return f"n={len(ordered)} p50={p50 * 1000:.0f}ms p95={p95 * 1000:.0f}ms max={ordered[-1] * 1000:.0f}ms"


def read_load(base: str, users: int, requests_per_user: int) -> list[float]:
    """Concurrent anonymous reads.

    The stack throttles anonymous clients (SP4: 60/min per IP), so under
    sustained load a 429 is the CORRECT answer, not an outage: the script
    counts throttled responses separately and fails only on real errors
    (5xx / transport failures). A run with zero 429s and zero errors means
    the stack served everything; a run with 429s and zero errors proves the
    limiter held under load.
    """
    latencies: list[float] = []
    errors: list[str] = []
    throttled = 0
    lock = threading.Lock()
    start = time.perf_counter()

    def worker(worker_id: int) -> None:
        nonlocal throttled
        local_lat: list[float] = []
        local_err: list[str] = []
        local_throttled = 0
        for _ in range(requests_per_user):
            roll = random.random()
            if roll < 0.75:
                status, _payload, elapsed = http(
                    f"{base}/api/v1/problems/problems/?page=1&page_size=20"
                )
            elif roll < 0.9:
                status, _payload, elapsed = http(f"{base}/healthz")
            else:
                status, _payload, elapsed = http(f"{base}/readyz")
            if status == 200:
                local_lat.append(elapsed)
            elif status == 429:
                local_throttled += 1
                # Respect Retry-After (default 60s is longer than the smoke;
                # pace down instead of hammering the limiter).
                time.sleep(1.0)
            else:
                local_err.append(f"w{worker_id}: status={status}")
        with lock:
            latencies.extend(local_lat)
            errors.extend(local_err)
            throttled += local_throttled

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(users)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    wall = time.perf_counter() - start

    ok = len(latencies)
    total = users * requests_per_user
    print(
        f"[read]      {percentiles(latencies)} throttled={throttled} errors={len(errors)}"
    )
    print(
        f"[read]      throughput={ok / wall:.1f} ok req/s over {wall:.1f}s ({total} requests, {users} users)"
    )
    for err in errors[:5]:
        print("[read]      error:", err)
    if errors:
        sys.exit(1)
    return latencies


def judge_roundtrip(base: str, username: str, password: str) -> None:
    jar = CookieJar()
    status, payload, _ = http(
        f"{base}/api/v1/auth/login/",
        data={"username": username, "password": password},
        jar=jar,
    )
    if status != 200:
        print(f"[judge]     login failed: {status} {payload}")
        sys.exit(1)

    status, payload, _ = http(f"{base}/api/v1/problems/problems/?page_size=50", jar=jar)
    if status != 200:
        print(f"[judge]     catalog fetch failed: {status}")
        sys.exit(1)
    problems = payload.get("results", [])
    if not problems:
        print(
            "[judge]     no problems in catalog — seed first (manage.py seed_problems)"
        )
        sys.exit(1)
    problem = problems[0]

    code = "print(sum(map(int, input().split())))"
    status, payload, _ = http(
        f"{base}/api/v1/submissions/submit/",
        data={"problem": problem["id"], "language": "python3", "code": code},
        jar=jar,
    )
    if status not in (200, 201):
        print(f"[judge]     submit failed: {status} {payload}")
        sys.exit(1)
    submission_id = payload.get("id")

    started = time.perf_counter()
    verdict = None
    for _ in range(120):  # up to 120s
        time.sleep(1)
        status, payload, _ = http(
            f"{base}/api/v1/submissions/submissions/{submission_id}/", jar=jar
        )
        if status == 200:
            verdict = payload.get("verdict")
            if verdict in TERMINAL_VERDICTS:
                break
    elapsed = time.perf_counter() - started
    if verdict not in TERMINAL_VERDICTS:
        print(f"[judge]     no terminal verdict after {elapsed:.0f}s (last: {verdict})")
        sys.exit(1)
    print(
        f"[judge]     submission {submission_id} -> {verdict} in {elapsed:.1f}s end-to-end"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://127.0.0.1:8010")
    parser.add_argument("--users", type=int, default=10)
    parser.add_argument("--requests", type=int, default=30, help="per user")
    parser.add_argument(
        "--judge", action="store_true", help="also run one judged round-trip"
    )
    parser.add_argument("--username", default="bob")
    parser.add_argument("--password", default="BobPass-2026!x")
    args = parser.parse_args()

    print(f"load smoke against {args.base}")
    read_load(args.base, args.users, args.requests)
    if args.judge:
        judge_roundtrip(args.base, args.username, args.password)
    print("load smoke complete")


if __name__ == "__main__":
    main()
