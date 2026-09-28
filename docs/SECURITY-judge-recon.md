# SECURITY recon — judge execution path (`backend/submissions/judge_utils/` + `submissions/tasks.py`)

Date: 2026-09-22. Branch: `wave/nextjs-migration`. Confidence bands used inline: **high** = read directly, file:line anchor; **likely** = strong inference from read code; **uncertain** = not measurable from code alone. Every anchor is `file:line` in this repo.

---

## 1. Execution model summary — high

Celery task `judge_submission_task` (`backend/submissions/tasks.py:17-157`) drives the whole pipeline on the **Celery worker host**:

1. Marks submission COMPILING (`tasks.py:22-30`).
2. Creates a **host** `tempfile.TemporaryDirectory` (`tasks.py:32`) — the "sandbox dir" is a plain host temp dir, NOT an isolated FS.
3. `compile_code_in_sandbox(code, language, dir, problem.custom_libraries_allowed)` (`tasks.py:35-40`, `judge_utils/compilation.py:8-108`).
4. For each test case: `run_code_in_sandbox(exe, lang, tc.input_data, problem.default_time_limit_ms, problem.default_memory_limit_kb, dir, code, custom_libraries_allowed)` (`tasks.py:72-81`, `judge_utils/execution.py:11-211`).
5. If verdict AC and `problem.comparison_mode == CUSTOM_CHECKER`: writes `input.txt`/`user_output.txt`/`answer.txt` into a per-TC temp dir and calls `run_custom_checker(problem.checker_code, problem.checker_language, ...)` (`tasks.py:88-103`, `judge_utils/checkers.py:5-105`). Else `compare_outputs(...)` (`tasks.py:107-110`, `judge_utils/comparison.py:4-59`).
6. Persists `SubmissionTestResult` with output/error truncated to 10,000 chars (`tasks.py:112-120`), final verdict/score/times (`tasks.py:128-137`), temp dir cleaned in `finally` (`tasks.py:154-156`).

**Who controls the judge inputs (trust boundary) — high:** `custom_libraries_allowed` (JSON list), `checker_code`, `checker_language`, `default_time_limit_ms`, `default_memory_limit_kb` and test-case inputs are Problem fields (`backend/problems/models.py:73-79,107-112`). Problem creation requires only role `PROBLEM_CREATOR` — a **non-admin, self-service role** (`backend/problems/views.py:30-32` + `backend/users/permissions.py:22`). So "problem author" is a low-trust boundary on a public platform.

## 2. Process spawn mechanism — high

Every execution is a `docker run` CLI invocation spawned from the Celery worker via Python `subprocess`:

- Run: `subprocess.Popen(run_command, stdin=PIPE, stdout=PIPE, stderr=PIPE, text=True)` + `communicate(input=test_input)` (`execution.py:141-142`); argv built as a **list** (`execution.py:120-129`) — no `shell=True` anywhere in judge_utils/tasks (grep-verified), so no host shell injection through argv. **high**
- Compile: `subprocess.run([...], capture_output=True, timeout=30)` (`compilation.py:66`, `compilation.py:94`).
- Checker compile `subprocess.run(..., timeout=30)` (`checkers.py:38`), checker run `subprocess.Popen` + `communicate` (`checkers.py:86-87`).

Consequence — **likely**: the Celery worker user must have Docker CLI + daemon access; membership of the docker group is root-equivalent on the host. Any compromise of the worker process is host-root compromise. (Environmental; no code line states it, but every spawn is a `docker` client call.)

## 3. Sandboxing (in-container) — high, by reading the full argv construction

Common flags on ALL containers (`execution.py:120-128`, `compilation.py:56-63`, `compilation.py:85-91`, `checkers.py:31-36`, `checkers.py:74-80`):

| Control | Present? | Anchor |
|---|---|---|
| `--user 1000:1000` (non-root) | yes | `execution.py:122` |
| `--cap-drop=ALL` | yes | `execution.py:122` |
| `--security-opt=no-new-privileges` | yes | `execution.py:122` |
| `--memory`/`--memory-swap` cap | run + checker only | `execution.py:123-124`, `checkers.py:76-77`; **ABSENT from both compile containers** (`compilation.py:57-62`, `compilation.py:86-90`) |
| `--network none` | default | `execution.py:43-44,125`; **`bridge` (full network) when python3 + custom libs** `execution.py:56` |
| Volume mount `submissiondir:/app` | yes, `ro` default | `execution.py:42,125`; **`rw` for python custom libs** `execution.py:55` |
| `--pids-limit` | **no — never passed** | full argv lists above |
| `--read-only` rootfs / `--tmpfs` / `--ulimit` | **no** | idem |
| `--userns` remap | no | idem |
| custom seccomp | no (Docker default seccomp remains active — not disabled) | idem |

So: real but partial container isolation. No syscall-level tightening beyond stock Docker defaults; uid 1000 in container == uid 1000 on host (no userns-remap) — **high**.

## 4. Timeouts and memory limits — high

**Run stage** (`execution.py:117-142`):
- Inner (in-container): `timeout --signal=SIGKILL {time_limit_s + 1}s` wrapping `/usr/bin/time -f "%U %S %M %x %P %e" <program>` — wall-clock kill (`execution.py:117-118`).
- Outer (host Python): `communicate(timeout=time_limit_s + 3)`; `+10` headroom for python3+custom-libs (`execution.py:139-142`).
- `time_limit_s = time_limit_ms/1000` if `>0`, else hardcoded `1` s (`execution.py:36`); limits come from the Problem model with no upper-bound validator (`problems/models.py:73-74`).
- **Bug/vector:** on outer `subprocess.TimeoutExpired` the code never calls `process.kill()` (`execution.py:197-198`) — the `docker run` client (and potentially the container) is leaked on the host. **high (code), likely (runtime effect)**
- Time measured is **CPU** (user+sys) from `/usr/bin/time` (`execution.py:173-174`); wall-clock sleepers still die via the inner SIGKILL at +1 s → returncode 124 → TLE (`execution.py:181-182`). Sound.

**Compile stage:** 30 s host-side timeout only; **no in-container timeout, no memory cap** (`compilation.py:66`, `compilation.py:94`) — see vector E5.

**Checker stage:** 10 s limit, in-container `timeout` 11 s, `communicate` 13 s, 256 MB (`checkers.py:68-72`, `checkers.py:87`).

**Memory verdict is fake — high:** `MEMORY_LIMIT_EXCEEDED` is only ever produced by the `"mle_trigger"` input-string hack (`execution.py:206-207`); a real OOM gives returncode 137 → `RUNTIME_ERROR` (`execution.py:187-188`). Same for the enum at `submissions/models.py:19`.

## 5. Language runtimes — high

| Language | Compile image | Run image | Anchors |
|---|---|---|---|
| python3 | none (file write) | `python:3.11-slim` | `compilation.py:23-27`, `execution.py:50` |
| cpp17 | `gcc:latest` | `gcc:latest` | `compilation.py:37`, `execution.py:76` |
| java11 | `openjdk:11-jdk-slim` | `openjdk:11-jre-slim` | `compilation.py:84`, `execution.py:81` |
| checker (py/cpp) | `gcc:latest` / none | `python:3.11-slim` / `gcc:latest` | `checkers.py:24,29,48` |

**Unpinned floating tags** (`gcc:latest` notably) — image content drifts upstream; no digest pinning anywhere. **high** (supply-chain surface).

## 6. Filesystem access / mounts — high

- Submission temp dir (host `/tmp`-equivalent) → `/app` in container, `ro` by default (`execution.py:42,125`); compile containers mount it **without** `:ro` (`compilation.py:40`, `compilation.py:88` — writable, needed to emit binaries).
- User source is written to the **host** by the worker itself: `user_code.py`/`user_code.cpp`/`Main.java` (`compilation.py:24-26,34-35,82-83`); fixed filenames, no traversal.
- Java run mounts the whole submission dir and sets classpath `/app` (+ custom JARs) (`execution.py:83-111`).
- Nothing else host-side is mounted except the two `/opt` dirs below.
- Container writable layer (`/tmp`, `/var/tmp`, `$HOME`) is writable (no `--read-only`) — see E6.

## 7. `/opt/boost_headers` and `/opt/java_libs` settings usage — high

- `JUDGE_BOOST_HEADERS_PATH = os.environ.get('JUDGE_BOOST_HEADERS_PATH', "/opt/boost_headers")` (`backend/webcoder_api/settings.py:295`); `JUDGE_JAVA_LIBS_DIR_HOST = ... "/opt/java_libs"` (`settings.py:302`).
- **Boost:** used only at **compile** time for cpp17 when the problem's `custom_libraries_allowed` contains the literal `"boost_headers"`: host dir mounted `:ro` at `/usr/local/include/boost_custom` and `-I` added to g++ (`compilation.py:44-49`). Host path comes from settings/env, not from user input. Never mounted into run containers.
- **Java libs:** used at **run** time for java11 when `custom_libraries_allowed` is **non-empty (any identifier, not a java-specific one)** (`execution.py:87`): host dir mounted `:ro` at `/app/host_java_libs` (`execution.py:93`, constant at `execution.py:9`), and each entry is appended as a JAR filename to the classpath (`execution.py:97-102`). The filename filter blocks only `..`, `/`, `\` (`execution.py:99`) — see vector E10.
- Both mounts are read-only and their host sources are operator-configured — no direct traversal from user input. **high**

## 8. Escape / abuse vectors visible in code (not hypothetical — each names its line)

Ordered by severity for a PUBLIC platform where any authenticated `PROBLEM_CREATOR`-role user controls the marked inputs:

- **E1. Full network egress for user-submitted Python (CRITICAL).** When a problem sets `custom_libraries_allowed` non-empty and the submission is python3, the run container gets `--network bridge` (`execution.py:43-44,54-57`). User code then has unrestricted outbound internet AND the Docker bridge network: SSRF against the host gateway (172.17.0.1), sibling containers, any DB/Redis/Django ports bound on the host, plus exfil/scanning. Trigger is a problem-author decision; any submission to that problem inherits it. **high**
- **E2. Unbounded stdout/stderr buffered in the judge worker (HIGH, any submitter).** `communicate()` reads the entire program output into worker RAM (`execution.py:141-142`); truncation to 10k happens only at persistence (`tasks.py:118-119`). A tight print loop emits hundreds of MB within a 1 s limit → Celery worker / host memory exhaustion. No output-size cap exists anywhere in the read code. **high**
- **E3. Arbitrary pip install with network (HIGH, problem-creator).** `requirements_custom.txt` is written verbatim from the problem's `custom_libraries_allowed` lines (`execution.py:58-61`) and installed via `pip install --user -r` inside the network-enabled container (`execution.py:63-70`). pip requirement syntax permits VCS URLs (`git+https://…`) and options → arbitrary code fetch+execute, from a PROBLEM_CREATOR-level account (worse than the checker path: this one has E1's network). The `sh -c` string itself interpolates only the server-chosen filename — no shell injection there. **high**
- **E4. rw host mount in the same E1 path (MEDIUM).** `mount_mode = "rw"` (`execution.py:55`): container uid 1000 (== host uid 1000, no userns remap) writes real host files inside the temp dir — tampering with the submission dir contents between test cases (same dir reused across TCs, `tasks.py:32` + loop at `tasks.py:61`). **high (code), likely (impact)** 
- **E5. Compile containers: no memory cap, no pids-limit, client-only kill (HIGH, any submitter).** `compilation.py:57-62` and `compilation.py:86-90` pass no `--memory`/`--pids-limit`. A C++ template/allocator bomb compiles with unbounded host RAM for up to 30 s; on `subprocess.run(timeout=30)` only the docker *client* is killed — the container itself is not stopped by that (docker-run client kill leaves the container running — **likely**, docker semantics; flag absence is **high**). Same no-memory-cap compile shape exists for the checker (`checkers.py:31-36`). Additionally, no `--pids-limit` on ANY container (`execution.py:120-128`) → in-container fork bomb exhausts host PIDs (cap-drop does not stop fork). **high**
- **E6. Disk-fill via container writable layer (MEDIUM, any submitter).** No `--read-only`, no `--tmpfs`, no size `--ulimit`s (`execution.py:120-128`): programs can write GBs to `/tmp` inside the container → host docker storage exhaustion. `/app` itself is `ro` for cpp17 runs, so this is the writable-layer path. **high (flags absent), likely (impact)**
- **E7. Verdict backdoor trigger strings (HIGH — contest integrity).** `"tle_trigger"`/`"mle_trigger"` in the TEST INPUT and `"re_trigger"` in the SOURCE flip an ACCEPTED verdict to TLE/MLE/RE and blank the output (`execution.py:204-209`). Test input is problem-author data → a malicious problem (or any input accidentally containing the substring, case-insensitive `.lower()`) makes correct submissions fail with fabricated verdicts. Debug leftovers that also mean MLE is never genuinely detected (§4). **high**
- **E8. Resource-usage line spoofing (MEDIUM, any submitter).** The `/usr/bin/time` result is found by scanning stderr backwards for the last 6+-token line whose 5th token ends in `%` (`execution.py:148-158`) — a user program printing a forged line (`0 0 1 0 1% 0`) after the real one wins the scan → reported time/memory (and the CPU-TLE branch at `execution.py:183-184`) manipulable. Verdict itself stays returncode-driven, so impact is stat fraud + TLE-classification edge. **high (mechanism), likely (exploitability)** 
- **E9. Docker group = host root for the worker (structural, HIGH if worker compromised).** Every judge action is a `docker` CLI call from the Celery worker (`compilation.py:56`, `execution.py:120`, `checkers.py:31,74`); the worker therefore holds daemon access. **likely** (environmental inference)
- **E10. Java classpath separator injection (LOW, problem-creator).** JAR-name filter omits `:` (`execution.py:98-101`), and `:` is the classpath separator — an entry like `x.jar:.` appends extra classpath entries (constrained: `/` is blocked, so only slash-free paths). **high (code), low impact**
- **E11. Unpinned image tags (MEDIUM supply chain).** `gcc:latest` for compile and RUN of cpp17 (`compilation.py:37`, `execution.py:76`, `checkers.py:29,48`); python/java pinned to major tags only, no digests. **high**
- **E12. Internal-error detail leaked to submitters (LOW).** `str(e)` lands in `detailed_feedback` (`tasks.py:150`), raw stderr echoed in error paths (`execution.py:191-195`) → host paths/internal details disclosure. **high**
- **E13. Outer-timeout process leak (LOW-MEDIUM).** No `process.kill()` after `TimeoutExpired` (`execution.py:197-198`) — leaked docker clients/containers, chiefly in the E1 network-hang path. **high (code)**
- **E14. Author-set limits unbounded (LOW).** `default_time_limit_ms`/`default_memory_limit_kb` IntegerFields without validators (`problems/models.py:73-74`) — a problem can demand e.g. `--memory 999999999k`; docker rejects impossible values → INTERNAL_ERROR noise, or very long effective timeouts. **high (no validator), low impact**

**Controls that DO exist (for fairness):** argv-list spawns (no shell); `--cap-drop=ALL` + `no-new-privileges` + uid 1000 everywhere; memory+swap caps on run/checker containers; `--network none` default; `:ro` mounts default; in-container wall-clock SIGKILL; `/opt` mounts are ro and operator-configured; partial JAR traversal filter.

## 9. Coverage line

Measured: tasks.py (full read), judge_utils/{execution,compilation,checkers,comparison,__init__}.py (full read), settings.py:280-303, problems/{views.py:1-41,models.py:73-112,serializers.py:61-64,admin.py:41-45}, users/permissions.py:15-31, submissions/models.py:12-19. NOT measured (out of scope / not runnable here): docker daemon config (userns, default pids-limit, seccomp profile), actual host environment (`/opt/*` existence, worker user), runtime confirmation of client-kill-orphan-container behavior (E5), frontend. This section does not satisfy UNVERIFIED inline obligations above — each such claim carries its own inline tag.
