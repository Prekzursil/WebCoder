# WebCoder Wave Report — 2026-09-22 (branch `wave/nextjs-migration`)

> **PROVENANCE.** Written by the wave report unit (`report:wave`, workflow wf_c8e4c79c).
> Method: re-measurement from disk — every number below was re-derived by THIS unit from
> the artifacts the green runs left behind (`.coverage` data file, `coverage/clover.xml`,
> `journal.jsonl`, `git status/log`, file re-reads), then cross-checked against the lane
> digests in the workflow journal. Confidence bands inline: **high** = measured by this
> unit; **likely** = single-source lane measurement corroborated but not independently
> re-executed; **uncertain/UNVERIFIED** = not measurable here, settling experiment named.
> A gate that could not be run is FAILED-TO-RUN in section 6, never PASS. This file was
> written skeleton-first and rewritten at the coverage and final milestones; no UNKNOWN
> markers remain — the unit completed its measurement pass.
>
> **Overall verdict: the wave is substantively COMPLETE on disk but DELIVERY-INCOMPLETE.**
> Nothing was committed (beyond 4 pre-existing local commits), pushed, or PR'd; the wave's
> own binding fan-in sweep (WAVE-DECISIONS.md D3) never executed; one declared-BLOCKING
> experiment (API envelope, PORT-MAP §0.1) has no receipt. All three are measured below.

---

## 1. Phase verdicts (P0–P5)

The wave ran 8 phases / 25 lanes (measured from the workflow `journal.jsonl`: 25 `started`
records, 24 `result` records — the 25th lane is this unit). No P0–P5 numbering exists in
any on-disk wave artifact; the mapping below is this unit's construction over the measured
phase labels, stated openly (likely, mapping; the lane statuses themselves are high).

| Phase | Wave phases/lanes | Verdict | Evidence (all measured this session unless tagged) |
|---|---|---|---|
| **P0 — Recon** | Recon ×4 (`recon:judge/api/pages/infra`) | **OK** | journal.jsonl: 4 results, `ok:true`, files_written each; all 4 docs disk-verified with sizes (section 4) — high |
| **P1 — Next 15 port** | Scaffold ×1 + Port ×5 + `gate:frontend` | **OK (uncommitted)** | Next 15.5.25 app at `frontend/web/` (untracked, `git status`); 14 `page.tsx` routes (`find src/app -name page.tsx`, list in §4); `next build` red/green exit codes measured by `verify:ci` (ci-proof §4); 229/229 vitest (ci-proof §3) — high |
| **P2 — Security audits + judge remediation** | `sec:judge-audit`, `sec:auth-audit`, `sec:judge-docker` | **PARTIAL** | Both audits OK on disk (re-read in full). Remediation is additive-only: `JUDGE_BACKEND` abstraction delivered + 100%-covered + contract-tested, judge image `webcoder-judge-runner:latest` built, compose hardening flags live (re-read) — but `JUDGE_BACKEND=container` is NOT wired into `submissions/tasks.py`, `docker compose up` full-stack never ran (host RAM), celery.py still hardcodes the filesystem broker (sec:judge-docker blockers, journal.jsonl; re-confirmed in docker-compose.yml:69-73 comment) — high |
| **P3 — Backend tests/coverage** | Backend ×5 (`be:settings/problems/submissions/users/control`) | **BLOCKED (partial)** | 195 passed, exit 0, via new `backend/webcoder_api/test_settings.py` sqlite override (ci-proof §2; re-read). But: `be:control` vacuous — no `control` Django app exists, pytest exit 5 (D1, sentinel re-read); `be:submissions` NOT-OK — lane hit tool denials and its `tests_wave.py` (760 stmts) is silently never collected (my coverage table: 0%); the D1-retasked `webcoder_api` unit left NO deliverable (`backend/webcoder_api/test_wave.py` absent; asgi/wsgi measured 0%) — high |
| **P4 — CI both-states proof** | `verify:ci` | **OK** | `docs/ci-both-states-proof_2026-09-22.md` re-read: every gate has a red-state and green-state exit code (pytest 1/0, vitest 1/0, build 1/0, npm ci 1/dry-run-0, pip 1/FAILED-TO-RUN); honest exceptions in §6 below — high |
| **P5 — Verify/review + delivery** | `verify:e2e`, `review:correctness`, `review:security`, `verify:critic`, then commit/push/PR | **BLOCKED** | `verify:e2e` executed 0 tests (lane sandbox had no shell tools; port 3000 occupied by an unrelated Mythic C2 frontend — lane-measured); `review:correctness` NOT-OK (2 blockers); `review:security` OK (0 new secrets committed, XSS sinks 0 in port); critic OK with 9 blockers. **Delivery never ran**: `git status --porcelain -b` = bare `## wave/nextjs-migration` (no upstream), 17 untracked entries + 5 modified tracked files + 6,803 churned `backend/venv` paths (3,685 M + 3,118 D, grep-counted); `gh pr list --head wave/nextjs-migration --state all` → empty; origin exists (`git remote -v` → github.com/Prekzursil/WebCoder.git) so push is possible — high |

**Input-truncation note (P3-10 class):** both lane digests fed to this unit arrived
truncated mid-sentence (critic input cut at "A-14 CRITICAL, fully measured chain"; the
verify input cut at "BOTH-STATES p…"). Every claim after each cut was therefore
re-derived from disk by this unit; nothing below rests on the truncated tails — high.

---

## 2. Coverage ACTUALS vs the 100% target

**SSOT:** `.coverage-thresholds.json` (repo root) — thresholds **100** on
lines/branches/functions/statements, `blockPRCreation:true`,
`blockTaskCompletion:true`. Its own `$comment` (lines 3) states the floor is enforced by
the orchestrator reading the file: `pytest.ini` carries no `--cov-fail-under`
(pytest.ini:4, re-read) and `vitest.config.ts` has no `coverage.thresholds` block
(vitest.config.ts:5-16, re-read). **A PR opened today would bypass the floor at tool
level** — deliberate per the no-silent-downgrade rule; wiring decision deferred to the
owner (ci-proof §7.3) — high.

### 2.1 Backend (Django), per app — measured by this unit

Command (this session): `cd backend && ./venv/Scripts/python.exe -m coverage report
--data-file=.coverage` — reading the data file the clean-state gate run left behind
(that run: exit 0, `195 passed, 1 warning in 90.69s`, ci-proof §2). Aggregation per app
by `cov_agg.py` over the full table (workflow scratch).

| Unit | Stmts | Missed | Covered | Gap to 100% |
|---|---|---|---|---|
| problems | 797 | 0 | **100.0%** | 0 |
| users | 771 | 0 | **100.0%** | 0 |
| submissions | 1498 | 1197 | **20.1%** | −79.9 |
| webcoder_api | 103 | 15 | **85.4%** | −14.6 |
| manage.py (repo root) | 11 | 11 | **0%** | −100 |
| **TOTAL** | **3180** | **1223** | **62%** (tool-printed; precise 61.5%) | −38 |

- No `control/` rows exist — the directory holds no Python (D1, re-confirmed by the
  coverage table itself) — high.
- No venv rows in the table — the ci-proof §7.5 venv-pollution caveat resolves CLEAN for
  this data file (high).
- submissions detail: `judge_utils/execution.py` 5%, `compilation.py` 7%, `comparison.py`
  6%, `checkers.py` 6%, `tasks.py` 15%, `views.py` 57%, `admin.py` 50%, `models.py` 96%,
  `serializers.py` 74%, migrations 0%; the NEW `judge_utils/backend.py` is **100%**.
  `submissions/tests_wave.py` = 760 stmts at 0% — never collected (D2 filename contract;
  measured). Excluding that dead test file from the denominator: 301/738 = **40.8%** —
  both numbers stated because the intended denominator is an owner/orchestrator call
  (uncertain which; the D3 sweep's "re-run per-app coverage, record actuals" would have
  settled it).
- webcoder_api gap: `asgi.py` 0/4, `wsgi.py` 0/4 (the D1-retasked unit that never
  delivered), `celery.py` 92%, `settings.py` 91% (env-gated branches, honestly
  blocked-by-env per D1) — high.
- Collected-test split of the 195 (review:correctness metrics, journal.jsonl — likely):
  problems 94 (via a 1-stmt star-import shim `problems/test_wave.py`, re-read), users 81,
  submissions 20.

### 2.2 Frontend (Next.js vitest), per file — measured by this unit

Command provenance: `npx vitest run --coverage` clean-state run of ci-proof §3 (exit 0,
`Test Files 24 passed (24)`, `Tests 229 passed (229)`, 14.04s — lane-measured, exit codes
red/green proven); THIS unit parsed the artifact that run wrote:
`frontend/web/coverage/clover.xml` (script `clover_parse.py`, workflow scratch).

| File | Stmts cov/total | Branches cov/total | Stmt% |
|---|---|---|---|
| `src/services/ApiService.ts` | 7/49 | 2/25 | **14.3%** |
| `src/context/AuthContext.tsx` | 22/49 | 4/10 | **44.9%** |
| `src/components/layout/Navbar.tsx` | 16/21 | 14/31 | **76.2%** |
| all other 30 runtime files | — | — | **100%** |

- Project totals (clover `<project>`): statements **746/820 = 91.0%**, branches
  **528/578 = 91.3%**, functions **191/222 = 86.0%**; lines 90.97% (ci-proof §3 measured
  90.94/91.34/86.03/90.97 — two independent reads agree) — high.
- The uncovered total (74 stmts) is fully accounted for by the three files above
  (42 + 27 + 5) — high.
- Denominator completeness: clover lists 35 files = all 33 runtime TS/TSX source files +
  2 css; the 3 TS files absent are type-only (`types/api.ts`, `types/index.ts`) and test
  infra (`vitest.setup.ts`) — verified by `find src -type f ! -name "*.test.*"` = 36 — high.
- Caveat: per-file function counts in the clover export are unreliable (per-file
  `functions` attribute emits 0 while project totals emit 191/222); function coverage is
  cited at project level only — high (defect is in the export, not the run).

### 2.3 Verdict vs target

Backend **62%** / frontend **86–91%** against the **100%** SSOT floor: NOT met on either
surface (high). Dominant gaps: submissions judge engine (uncollected `tests_wave.py` +
engine files), webcoder_api asgi/wsgi, ApiService.ts/AuthContext.tsx/Navbar.tsx.

---

## 3. Security findings summary (judge + auth) — docs re-read in full by this unit

**Auth/CORS/secrets — `docs/SECURITY-AUDIT-auth.md` (v2, audited @ `40fda968`): verdict
"NOT production-ready". 20 findings:**

| Severity | IDs | Headline |
|---|---|---|
| CRITICAL | A-14, A-19, A-01 | anonymous registration accepts `role:"ADMIN"` (privilege escalation, full chain measured: serializers.py:29,33,56 + views.py:21 + permissions.py:13); `manage.py check` exits 1 (ACCOUNT_SIGNUP_FIELDS `'password'` must be `password1`, settings.py:197-201); `DEBUG=True` hardcoded (settings.py:37) |
| HIGH | A-15, A-02, A-03, A-04, A-05, A-06 | login response incl. live JWTs logged at INFO; `ALLOWED_HOSTS=[]`; both tokens in localStorage (XSS-stealable); GitHub OAuth scope `repo`+`read:org` (private-repo write); no token rotation/blacklist; logout clears localStorage only — refresh stays valid 24h |
| MEDIUM | A-07, A-08, A-09, A-16 | email verification optional; DRF default permissions commented (default-AllowAny); dead duplicate DJ_REST_AUTH dict; no token-refresh flow anywhere in frontend |
| LOW/INFO | A-10..A-12, A-17..A-20, A-13(+) | hardcoded CORS/URLs, console.log, filesystem broker side-effects; A-13 positive: fail-loud env secrets |

`manage.py check --deploy` additionally exits 1 with 10 issues (W004/W008/W012/W016/W018/
W020 + the 3 check issues; W009 is a probe artifact — audit §3.2). **Status of the auth
P0-P3 patch list: NOT applied by any wave lane** — the audits were read-only and the port
ported functionality; the backend auth fixes (P0-1..P0-4) remain OPEN — high (no lane
files_written touches users/serializers.py or settings DEBUG).

**Judge sandbox — `docs/SECURITY-AUDIT-judge.md`: 15 findings (J1–J15):**

| Severity | IDs | Headline |
|---|---|---|
| CRITICAL | J1 | custom-libs python3 path: `--network bridge` + rw host mount + verbatim pip requirements (VCS URLs execute remote code), reachable end-to-end by a self-service CREATOR role via DRAFT problems with NO approval gate (execution.py:54-70) |
| HIGH | J2, J3, J4, J5* | verdict-fabrication trigger strings + fake-only MLE (execution.py:204-209); unbounded output buffered in worker RAM; compile containers without memory cap / no pids-limit anywhere / client-side-only 30s timeout; worker holds docker-daemon access (*UNVERIFIED, environmental) |
| MEDIUM | J6..J10 | rw mount cross-test tampering; writable container layer; resource-line spoof via lingering forked child (recon mechanism corrected); unpinned floating image tags; submission validation gaps (unvalidated language, allowed_languages never enforced, unbounded code, submissions to unapproved problems) |
| LOW | J11..J15 | TimeoutExpired without kill(); `str(e)`/stderr leaked to submitters; Java classpath `:` injection; `0` KB memory limit disables cap; hidden-test prefixes + full docker argv in worker logs |

Controls verified present: argv-list spawns (no `shell=True` anywhere), `--rm`,
`--user 1000:1000`, `--cap-drop=ALL`, `no-new-privileges` on every container,
`--network none` everywhere except the J1 path, `:ro` mounts by default, DB-side 10k
truncation. Two corrections to the recon doc were made by the audit (E8 mechanism, E5
`--rm` nuance) — both docs re-read; anchors re-cited by this unit where load-bearing.

**Remediation state (measured on disk):** the wave's judge-docker lane delivered the
`JUDGE_BACKEND` local|container abstraction (`backend/submissions/judge_utils/backend.py`,
additive, legacy flow untouched — re-read), the hardened compose judge-runner service
(`docker-compose.yml:111-135`: network none, read-only rootfs, cap_drop ALL,
no-new-privileges, pids 256, mem 1g, cpus 1.5, tmpfs noexec — re-read), both Dockerfiles
(re-read), 20 contract tests in `submissions/tests.py` (prescribed pytest `20 passed` —
lane-measured), and the judge image built (`webcoder-judge-runner:latest`, compose config
validation PASS — lane-measured). **Not done:** wiring `JUDGE_BACKEND=container` into
`submissions/tasks.py` (so J1's legacy network path is still the live judging path),
live compose-up verification, celery broker env support — high (re-read of compose
comments 69-73 corroborates the wiring gap).

---

## 4. Disk-verified artifact inventory

Every artifact below was re-Read or re-measured by this unit this session. Sizes via
`stat -c "%s %n" docs/*`; code artifacts via direct Read.

**Docs (all 8 wave docs + this report):**

| Path | Bytes | disk-verified |
|---|---|---|
| docs/API-MAP.md | 18,780 | YES — head re-read (no pagination anywhere, :15; control non-app, :6) |
| docs/INFRA-MAP.md | 12,415 | YES — head re-read (2 broken CI workflows measured, §1) |
| docs/PORT-MAP.md | 26,747 | YES — :1-30 and :185-202 re-read (§0.1 envelope still UNVERIFIED, :14 and :194) |
| docs/SECURITY-AUDIT-auth.md | 20,127 | YES — full re-read (sections 3 and 5 here) |
| docs/SECURITY-AUDIT-judge.md | 20,516 | YES — full re-read |
| docs/SECURITY-judge-recon.md | 15,503 | YES — head re-read (execution model + trust boundary) |
| docs/WAVE-DECISIONS.md | 1,947 | YES — full re-read (D1/D2/D3) |
| docs/ci-both-states-proof_2026-09-22.md | 7,843 | YES — full re-read |
| docs/WAVE-REPORT_2026-09-22.md | this file | written by this unit |

All six sizes claimed by the critic match byte-exact (high — independent corroboration
of that unit's spot-check).

**Code/config artifacts (untracked unless noted; all re-read):**

| Path | What it is |
|---|---|
| frontend/web/ (whole tree, untracked) | Next 15.5.25 App Router port: 14 `page.tsx` routes (admin/dashboard, admin/problem-queue, complete-registration, login, my-created-problems, my-submissions, problems, problems/[problemId], problems/[problemId]/edit, problems/create, profile, register, submissions/[submissionId], root), 24 test files, own .gitignore (ignores node_modules/coverage/tsbuildinfo — measured via `git check-ignore -v`) |
| frontend/web/src/app/problems/_lib/problems-api.ts | server-side catalog API module; carries the envelope answer in comments (:10-14) |
| frontend/web/src/context/AuthContext.tsx | ported auth — still localStorage for both tokens (:29-32) |
| frontend/web/coverage/{clover.xml,coverage-final.json,index.html} | vitest coverage artifacts of the green run (parsed this session) |
| .github/workflows/frontend.yml | new: Node 22, npm ci, build, vitest --coverage, cwd frontend/web, path-filtered |
| .github/workflows/django.yml (MODIFIED, tracked) | rewritten: py3.12, postgres:16 service :5432, env secrets, `pytest --ds webcoder_api.test_settings` (old file installed from nonexistent webcoder_project/backend/ — could never pass, ci-proof §7.1) |
| .coverage-thresholds.json | repo-root SSOT (re-read in full) |
| backend/webcoder_api/test_settings.py | sqlite test-settings override (re-read in full) |
| backend/pytest.ini (MODIFIED) | python_files contract + --cov=. term-missing/html (re-read) |
| backend/.env.example (MODIFIED) | SECRET_KEY/DB_*/JUDGE_BACKEND template, DB_PORT=5433 (re-read) |
| backend/Dockerfile, backend/Dockerfile.judge, docker-compose.yml | compose stack: postgres/redis/backend/judge-runner + commented Next.js frontend placeholder (re-read; note the placeholder still points at `frontend/webcoder_ui`, not the new `frontend/web` — stale after the port) |
| backend/submissions/judge_utils/backend.py | JUDGE_BACKEND abstraction (head re-read) |
| backend/submissions/tests.py (MODIFIED, tracked) | +20 judge contract tests (lane) |
| backend/control/tests_wave.py, backend/problems/tests_wave.py, backend/submissions/tests_wave.py | D2-violating filenames still on disk (heads re-read; D3 sweep did not run) |
| backend/problems/test_wave.py, backend/users/test_wave.py | D2-compliant: shim + real suite (heads re-read) |
| backend/problems/tests.py | 3-line stub unchanged (re-read) |
| backend/settings.py +11 etc. | part of the 5 modified tracked files (git status) |

**Agent-claimed only (NOT re-verified by this unit):** the `webcoder-judge-runner:latest`
image build and compose config validation PASS (sec:judge-docker lane measurements — no
docker daemon interaction performed by this unit); local PG18 `webcoder_user` auth
failure on :5433 (critic input; this unit did not probe Postgres); CRA jest 1-suite green
and i18n parity details (review:correctness). Everything else above is disk-verified.

**Git state (measured):** branch `wave/nextjs-migration`, NO upstream (`git status
--porcelain -b` bare header); origin present; `gh pr list --head wave/nextjs-migration
--state all` → EMPTY; 4 local commits (HEAD `40fda968` env-driven secrets); 17 untracked
entries; 5 modified tracked files; 6,803 churned venv paths (3,685 M + 3,118 D).

---

## 5. OWNER ACTION list (ordered)

1. **Bootstrap local env — create `backend/.env`** (measured ABSENT; template
   `backend/.env.example` re-read): set `SECRET_KEY`, `DB_PASSWORD` (and keep
   `DB_PORT=5433`); fix the local PG18 role password for `webcoder_user` — the auth
   failure is agent-claimed (critic input), UNVERIFIED by this unit; settling probe:
   `psql -h localhost -p 5433 -U webcoder_user -d webcoder_db`. Until then, local
   runserver cannot boot (fail-loud env reads are working as designed — auth audit A-13).
2. **Decide JWT-cookie vs localStorage for the Next port.** Current port state: both
   tokens in localStorage (AuthContext.tsx:29-32, measured) — carries auth-audit A-03
   forward. Recommended: httpOnly cookies per audit patch P1-9 / PORT-MAP §8.4. This
   decision also gates the missing refresh-flow work (A-16).
3. **Judge container rollout decision.** The sandboxed judge-runner is built and
   contract-tested but (a) `JUDGE_BACKEND=container` is not wired into
   `submissions/tasks.py`, (b) full `docker compose up` never ran (host RAM risk),
   (c) celery.py hardcodes the filesystem broker, (d) J1's legacy network path remains
   the live judging path. Decide: wire-and-rollout now (closes J1's exposure) or keep
   `JUDGE_BACKEND=local` dev default until the J1 remediation lands (audit §5 order 1).
4. **Coverage-floor decision.** Wiring the 100% floor into the tools (vitest
   `coverage.thresholds`, pytest `--cov-fail-under`) turns both CI jobs permanently red
   today (62% / 86-91% measured). Options: wire floors now (red until gaps close),
   lower thresholds, or keep orchestrator-enforced (current, explicit in the SSOT
   $comment). Do not silently downgrade — owner call.
5. **Repo-hygiene decisions before the commit lands:** committed `backend/venv`
   (6,803 churned paths every status — remove from tracking or accept); tracked binary
   `backend/.coverage` (modified); untracked-and-NOT-ignored `mitm_mcp_traffic.db` +
   `frontend/webcoder_ui/{build,test}-baseline.log` (measured via `git check-ignore` —
   the frontend/web node_modules/coverage/tsbuildinfo trio is ALREADY ignored by the
   scaffold .gitignore, contra the critic's P2-7 wording); retire or fix
   `django_ci.yml` (untouched silent-pass duplicate, ci-proof §7.2).
6. **Then orchestrator sequence → PR + merge:** run the D3 fan-in sweep (rename
   `tests_wave.py`→`test_wave.py` or port shims, delete dead files), add the 3 missing
   .gitignore entries, commit (backend/.env stays ignored — verified), push
   `wave/nextjs-migration` to origin (no upstream yet), open PR (none exists in any
   state — measured), shepherd CI (both workflows now path-correct), merge after owner
   review of sections 2-3 gaps.

Also open (orchestrator, pre-PR): the PORT-MAP §0.1 curl receipt — run the settling
curl against `/api/v1/problems/problems/`, record the envelope answer in PORT-MAP
(currently the SSOT doc contradicts the shipped code comment in problems-api.ts:10-14;
the comment is likely correct — corroborated by API-MAP "no pagination anywhere" — but
the receipt does not exist).

---

## 6. FAILED-TO-RUN list (honest; none of these count as PASS anywhere above)

1. `pip install -r requirements.txt` clean-state, locally — backend venv has no pip
   module/shim; repairing would mutate an in-flight venv (ci-proof §6). Red-state proven
   with real pip; authoritative clean check deferred to the CI runner.
2. `docker compose up` full-stack live check (postgres/redis/backend) — host RAM risk
   (~1.1 GB free at lane time); judge image build + compose config validation DID pass
   (sec:judge-docker, agent-claimed).
3. E2E verification — `verify:e2e` executed 0 tests: lane sandbox had no shell/file
   tools, Playwright MCP blocked `file:` URLs, and localhost:3000 serves an unrelated
   Mythic C2 frontend (lane-measured). No end-to-end user journey has run against the
   ported app. Settling path: owner env bootstrap (action 1) + runserver + Playwright
   against a WebCoder-owned port (lane recommended 3311).
4. `npm ci` full clean-state install, locally — only `npm ci --dry-run` proven (exit 0);
   a real install would rebuild node_modules under low RAM (ci-proof §5).
5. The declared-BLOCKING API-envelope curl experiment — never recorded as run
   (PORT-MAP.md:14 still UNVERIFIED; answer encoded only in problems-api.ts comments).
6. D3 fan-in sweep (rename + per-app coverage re-run + actuals record) — declared
   binding in WAVE-DECISIONS.md:17-18, never executed (all three `tests_wave.py` still
   on disk, measured).
7. This unit did NOT re-execute the test suites themselves (pytest/vitest) — coverage
   numbers here are re-measured from the data artifacts those runs left (`.coverage`,
   `clover.xml`) plus exit-code receipts in ci-proof; a fresh from-scratch run of both
   suites was judged a RAM risk on this box (~2 GB free) and is left to the orchestrator
   pre-PR.
8. Local PG18 `webcoder_user` auth probe — not attempted (no psql credential material
   in this unit's scope); the auth-failure claim stays agent-claimed.

---

*Generated 2026-09-22 by `report:wave` (wf_c8e4c79c). Scratch scripts used:
`clover_parse.py`, `cov_agg.py`, `journal_sum.py` (workflow dir, outside the repo).
No repo files other than this report were written; no git write operations performed.*
