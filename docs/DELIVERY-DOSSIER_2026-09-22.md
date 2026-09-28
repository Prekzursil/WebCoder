# WebCoder Delivery Dossier — 2026-09-22 (branch `wave/nextjs-migration`)

> **PROVENANCE.** Written by the `report:dossier` unit of workflow `wf_4c7f6644-d3f`
> (run-id reused from the parked wave `wf_c8e4c79c-1c8`; lane receipts live in that dir).
> Method: every artifact cited below was re-Read or re-measured by THIS unit this session
> (Read tool on receipts/logs/skill files; fresh `git status`/`git rev-parse` in the repo;
> file-existence checks). Lane claims were cross-checked against the run journal
> (`journal.jsonl`, 10 lane results + this unit). Confidence bands inline: **high** =
> measured by this unit; **likely** = lane-measured, receipt on disk re-read by this unit;
> **UNVERIFIED** = not measurable here, settling path named. A gate that could not run is
> FAILED-TO-RUN, never PASS. Numbers below are the OFFICIAL delivery numbers and supersede
> the WAVE-REPORT priors where they differ (deltas explained in §2).

---

## 1. Per-item table (A1–A7, B1–B5)

| Item | Scope | Verdict | Producing command (and receipt) |
|---|---|---|---|
| **A1** — D3 rename sweep | Rename `tests_wave.py`→`test_wave.py` in all backend apps so pytest collects them | **ok** (high) | `pytest --collect-only -q <app> --ds webcoder_api.test_settings` per app, before/after: 195→**295** collected (control 0→2, problems 94→94, submissions 20→118, users 81→81), exit 0, zero collection errors. Disk re-verified by this unit: `backend/{control,problems,submissions}/test_wave.py` exist, `ls backend/*/tests_wave.py` → none. Informational smoke run: 189 passed / 5 failed in 81.79s (the 5 = latent defects, see §2) |
| **A2** — webcoder_api unit (D1 retask) | Author `backend/webcoder_api/test_webcoder_api.py` to 100% lines+branches | **ok** (high) | `SECRET_KEY=testkey DB_PASSWORD=x ./venv/Scripts/python.exe -m pytest webcoder_api --ds webcoder_api.test_settings --cov=webcoder_api --cov-report=term-missing` → 11/11 passed, exit 0, ×3 runs (1.76s/2.09s branch-mode/1.54s), 0 fix iterations. All 8 package modules 100% lines AND branches. File on disk re-verified (262 lines) |
| **A3** — official receipt run | Full backend pytest+coverage + full frontend build/vitest/coverage, from scratch | **RUN COMPLETE, GATE RED** (`ok:false`) — numbers are official (high) | Backend: `pytest --ds webcoder_api.test_settings --cov=. --cov-report=term-missing -q` → exit **1**: `5 failed, 301 passed, 1 warning in 124.05s`; `TOTAL 3354 26 99%`. Frontend: `npm run build` exit 0 (15 routes); `npx vitest run --coverage` exit 0: 24 files / **229/229** tests, coverage 90.94/91.34/86.03/90.97. Logs re-read by this unit: `a3-pytest.log`, `a3-build.log`, `a3-vitest.log`, `a3-npm.log` + `A3-RECEIPT_2026-09-22.md`. NEW CI-blocking finding: `@vitest/coverage-v8` absent from package.json devDeps and the lock (re-verified by this unit: 0 hits in package.json) — CI `npm ci → vitest --coverage` will fail; receipt run restored it env-only (`npm install --no-save @vitest/coverage-v8@5.0.1`, manifests md5-unchanged) |
| **A4** — pinned defect fix + envelope receipt | Fix `users/permissions.py` obj.author→obj.user; settle PORT-MAP §0.1 statically | **ok** (high) | Fix re-verified on disk by this unit (`permissions.py` `return obj.user == request.user or is_admin`, ~:85). `pytest users submissions --ds webcoder_api.test_settings -q --no-cov` → **194 passed, 5 failed** (all 5 pre-existing latent in the newly-collected submissions suite; both-states revert control reproduced them identically); targeted permission+view re-run **13/13**. Envelope: `docs/API-ENVELOPE-RECEIPT.md` on disk (re-verified) — DRF list endpoints return BARE arrays, no envelope/pagination wrapper (static, ~90-95%; settling curl recorded for CI) |
| **A5** — venv churn | Untrack `backend/venv` (6,803 churned paths), clean delivery surface | **ok** (high) | `git rm -r -q --cached -- backend/venv` → exit 0; pre-op `git ls-files backend/venv` = 8,724 → post 0. `.gitignore` already covers `venv/` (`git check-ignore --no-index -v` receipt). Re-measured by this unit NOW: staged `D ` = **8,724**, all `backend/venv` (non-venv staged deletions: zero; `git diff --cached --name-only \| wc -l` = 8,724 — two instruments agree); venv worktree churn classes = 0. Receipt: `docs/TASK-A5-VENV-CHURN_2026-09-22.md` (on disk) |
| **A6** — *(inferred: .gitignore hygiene for the 3 wave-report gaps)* | — | **NOT DISPATCHED — FAILED-TO-RUN** | No `started` record for an A6 lane in `wf_4c7f6644-d3f/journal.jsonl` (10 lanes exist: A1-A5, A7, B1, B2, B4, B5). Scope label is this unit's inference, **UNVERIFIED**. Disk consequence measured: `mitm_mcp_traffic.db` and `frontend/webcoder_ui/{build,test}-baseline.log` remain untracked-and-NOT-ignored (wave-report §5.5 gaps still open) |
| **A7** — e2e retry | Playwright e2e against the ported app | **ok** (high) | Premise was false — no e2e existed (3 probes); suite BOOTSTRAPPED: `@playwright/test` 1.63.0 (package.json:30 re-verified), mock Django API :8901, app on port **3311** (3000 held by unrelated `com.docker.backend.exe` Mythic C2 frontend — untouched). `npx playwright test --project=chromium`: red state 1 failed/7 passed (exit 1) → fix → **8/8 passed, exit 0** (55.3s). Vitest regression after config edit: 229/229, exit 0. Receipt `A7-E2E-RECEIPT_2026-09-22.md` + specs/mock-api/playwright.config.ts all re-verified on disk |
| **B1** — G-10b container live-run | Close wf2's FAILED-TO-RUN docker item | **ok — CLOSED PASS** (likely; report re-read, artifacts on disk) | `docker build -t claude-code-fork:1.10.12-fork.1 D:/tools/claude-code-fork` → BUILD_EXIT:0 (real in-VM `npm ci`, 228 pkgs); `timeout 60 docker run --rm -i --network none claude-code-fork:1.10.12-fork.1 < init.json` → RUN_EXIT:0, MCP initialize handshake `serverInfo claude_code/1.0.0` (container-stdout.txt re-read by this unit); hardening: uid=999 non-root, node v22.23.2, `--network none`; never registered (0 refs in agents.json/.claude.json/config.toml). Receipt: `B1-container-run-report.md` |
| **B2** — G-8b agentType live resolution | Dispatch reader/writer micro-agents | **FAILED-TO-RUN** (structural) | No dispatch cause: the Agent/Task/Workflow tool does not exist in a workflow-subagent context (6 ToolSearch patterns + deferred-tool enumeration + positive controls). Verdict honest: reader/writer resolution NOT-TESTED. Settling path: dispatch from the orchestrator MAIN session (which holds the Task tool), after `mcp_ram_audit.ps1` per G-99 |
| **B3** — *(inferred: G-3b live in-harness hook firing, wf2's 3rd RAM-gated probe)* | — | **NOT DISPATCHED — FAILED-TO-RUN** | No `started` record in the journal; scope label is inference, **UNVERIFIED**. Note: the same structural absence that blocked B2 would block a live-hook-firing probe from a workflow subagent — main-session work |
| **B4** — concurrency dial adoption | Encode `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` into delegate-primitive skill | **ok** (high) | `## 10. Concurrency dial` present at `SKILL.md:335` in BOTH trees — re-verified by this unit (live `~/.agents/skills/delegate-primitive/SKILL.md` and repo-canon `agent-skills-toolchain/skills/delegate-primitive/SKILL.md`); mirrors md5-identical (8a5cb580…), pre-edit backups kept (.bak-concurrency-20260922); conservative default 4-6 encoded with G-12 RAM-gate cross-ref; route-to-ROOT finding recorded. Follow-up: run `sync_shared_state.ps1` before commit |
| **B5** — reconcile prep | Harness commit plan for both repos | **ok** (high) | `C:\Users\Prekzursil\.agents\HARNESS-COMMIT-PLAN_2026-09-22.md` + repo mirror both on disk, 16,935 B each (re-verified). 11 wf2 mirror claims sha256-confirmed (10 identical, BOTH-STATES repo-only as flagged); 3 corrections to PROGRAM-REPORT found (nested_ram_gate already committed e55493a02 21:39; ~/.agents is a 2nd live checkout; live-only artifacts canon-copied). Plan = 9 scoped commits + optional capture commit |

**Run accounting:** 12 item ids, 10 lanes dispatched, 7 ok / 1 gate-red run (A3) /
1 structural FAILED-TO-RUN (B2) / 2 not dispatched (A6, B3). Zero git write
operations by any lane (journal-confirmed; commits are orchestrator-side per contract).

---

## 2. Official receipt numbers vs wave-report priors — deltas explained

All "official" numbers below re-read from the raw logs by this unit (not from lane prose).

| Metric | Wave-report prior | OFFICIAL (A3) | Delta | Explanation |
|---|---|---|---|---|
| Backend tests passed | 195 | **301** | +106 | +98 submissions (D2-trapped `tests_wave.py` renamed by A1, now collected and passing), +2 control (A1), +11 webcoder_api (A2). Of the 118 newly-collected submissions tests, 5 fail (below) |
| Backend failed | 0 | **5** | +5 | Latent defects exposed at first-ever collection: 4× nullable-FK contract mismatch (tests+serializers/admin expect `N/A` for missing relation; schema says NOT NULL → `RelatedObjectDoesNotExist`/IntegrityError) + 1× live-docker test (`test_zero_time_limit_uses_one_second` spawns a REAL container; docker-start latency under RAM pressure exceeds the 2s limit → TLE≠AC). Proven pre-existing by A4's both-states revert control |
| Backend TOTAL coverage | 62% (3180 stmts / 1223 missed) | **99%** (3354 / 26) | +37 pts | The 760-stmt dead test file now executes at 99% (8 missed = the failing tests' lines); webcoder_api 85.4%→100% (asgi/wsgi/settings covered by A2). Remaining 26 missed, measured: `manage.py` 11 (0%), `submissions/test_wave.py` 8, `control/test_wave.py` 3, 4 elsewhere |
| Frontend build | green (lane) | **exit 0, 15 routes** | — | Unchanged |
| Frontend vitest | 229/229 | **229/229**, exit 0 | 0 | Identical to ci-proof §3 (90.94/91.34/86.03/90.97) — two independent runs agree |
| Frontend coverage reproducibility | assumed green | **BLOCKED from lock** | new finding | `@vitest/coverage-v8` missing from package.json devDeps + package-lock (0 hits in package.json, re-verified). The wave's green coverage rode an out-of-band install later pruned by npm. CI `npm ci → vitest --coverage` WILL fail until the devDependency lands (owner/orchestrator fix; A3 restored env-only with `--no-save`, manifests byte-identical) |
| e2e | 0 tests ran | **8/8 pass, exit 0** | +8 | A7 bootstrapped the suite (none existed), red/green proven, port 3311, mocked API |
| Collected backend tests | 195 | 306 (301+5) | +111 | A1's collect gate: 295 across 4 apps + 11 webcoder_api = 306 executed by A3 |

---

## 3. Delivery surface after venv clean (fresh measurement, this unit, ~22:05 local)

Branch `wave/nextjs-migration` @ `40fda968`; **no upstream configured** (measured:
`git rev-parse --abbrev-ref @{u}` → fatal). `git status --porcelain` class counts:

| Class | Count | Content |
|---|---|---|
| `D ` (staged deletion) | **8,724** | ALL `backend/venv` (A5's `git rm --cached`; zero non-venv staged deletions; porcelain = `diff --cached` = 8,724, two instruments) — awaiting the orchestrator's venv-removal commit |
| ` M` (worktree modified) | **7** | `.github/workflows/django.yml`, `backend/.coverage` (tracked binary), `backend/.env.example`, `backend/pytest.ini`, `backend/submissions/tests.py` (+20 judge contract tests), `backend/users/permissions.py` (A4 fix), `backend/webcoder_api/settings.py` |
| `??` (untracked) | **17** | `.coverage-thresholds.json`, `.github/workflows/frontend.yml`, `backend/Dockerfile`, `backend/Dockerfile.judge`, `backend/control/test_wave.py`, `backend/problems/test_wave.py`, `backend/submissions/judge_utils/backend.py`, `backend/submissions/test_wave.py`, `backend/users/test_wave.py`, `backend/webcoder_api/test_settings.py`, `backend/webcoder_api/test_webcoder_api.py`, `docker-compose.yml`, `docs/` (collapsed: wave docs + this dossier + API-ENVELOPE-RECEIPT + TASK-A5 receipt), `frontend/web/` (collapsed: the whole Next 15 port + e2e suite + playwright.config), `frontend/webcoder_ui/build-baseline.log`, `frontend/webcoder_ui/test-baseline.log`, `mitm_mcp_traffic.db` |

- **Venv churn is GONE**: 0 ` M`/` D`/`??` venv lines (was 6,803 churned + 3,118-deletion
  noise per wave report). The 8,724 staged deletions are the *intended* removal, visible
  in porcelain by construction until committed.
- Untracked-count drift across lane snapshots (16→17→18→17) is collapsed-directory
  granularity plus sibling lanes writing into `docs/`/`frontend/web/`; cause of each
  ±1 UNVERIFIED (A5 flagged the same). The 17 above is authoritative for now.
- Still NOT ignored (A6 never dispatched): `mitm_mcp_traffic.db`,
  `frontend/webcoder_ui/{build,test}-baseline.log` — decide ignore vs delete pre-PR.

---

## 4. PR-ready summary (paste-able)

> **Next.js 15 migration + delivery hardening for WebCoder** (`wave/nextjs-migration`).
> Ports the CRA frontend to Next 15.5.25 App Router at `frontend/web` (14 routes, 229/229
> vitest green, build green, plus a new Playwright e2e suite — 8/8 specs green on a
> WebCoder-owned port against a mocked DRF-contract API), rebuilds CI (path-correct
> django.yml with postgres service + sqlite test-settings override; new frontend.yml;
> every gate red/green-proven), untracks the accidentally-committed `backend/venv`
> (8,724 staged deletions — this commit removes it from history going forward and
> `.gitignore` already covers it), makes the previously-uncollectable backend suites
> collectable (D2 filename sweep: 195→306 tests) and takes backend coverage from 62% to
> **99%** (3354 stmts / 26 missed) including a new 100%-coverage webcoder_api unit
> (asgi/wsgi/settings/env-loader), fixes a real object-permission defect
> (`users/permissions.py` read a nonexistent `obj.author` on every submission check),
> and adds the security-audit deliverables (auth + judge audits, JUDGE_BACKEND
> local|container abstraction with contract tests, hardened compose judge-runner).
> **Review focus:** (1) the 5 remaining backend failures are first-ever-collected latent
> defects, not regressions — they expose a genuine nullable-FK contract mismatch between
> tests/serializers intent and the schema, plus one live-docker test that needs mocking
> (decision needed: schema vs serializer vs test fix); (2) `@vitest/coverage-v8` must be
> added to devDependencies before CI's coverage step can pass from the lock; (3) the
> auth-audit P0 items (A-14 admin self-registration, A-01 allauth config, DEBUG=True)
> remain OPEN by design — audits were read-only; (4) `JUDGE_BACKEND=container` is built
> and contract-tested but not yet wired into `tasks.py` (J1's legacy network path is
> still the live judging path). Full evidence: `docs/WAVE-REPORT_2026-09-22.md`,
> `docs/DELIVERY-DOSSIER_2026-09-22.md`, A3/A7 receipts in the workflow dir.

---

## 5. Owner-action list (refreshed; supersedes WAVE-REPORT §5 where noted)

1. **Bootstrap local env — `backend/.env`** (unchanged, still open; gates real-backend
   e2e and the envelope settling curl).
2. **JWT-cookie vs localStorage** for the Next port (unchanged; A-03 carried forward).
3. **Judge container rollout** (unchanged: wire `JUDGE_BACKEND=container` into
   `submissions/tasks.py`, celery broker env support, compose-up live check).
4. **Coverage-floor decision** (UPDATED): backend is now 99%, frontend 90.94–91.34 —
   wiring `--cov-fail-under` is far less red than at wave time, but the 5 failing tests
   block a 100% floor regardless; still an owner call, no silent downgrade.
5. **NEW — must-fix before CI green:** add `@vitest/coverage-v8` to
   `frontend/web/package.json` devDependencies (+ lock entry). Without it,
   `frontend.yml`'s `npm ci → vitest --coverage` fails on a clean runner (A3 blocker,
   re-verified by this unit).
6. **NEW — 5 backend failures ruling:** nullable-FK contract mismatch (schema vs
   serializer-N/A intent) ×4 + live-docker test ×1. Owner/orchestrator decision
   (schema migration vs serializer change vs test rewrite; mock at the subprocess seam).
7. **Repo hygiene** (UPDATED): venv untracking DONE (commit the 8,724 staged deletions
   as their own commit); still open: `mitm_mcp_traffic.db` + the two
   `frontend/webcoder_ui/*-baseline.log` (ignore or delete — A6 never ran), tracked
   binary `backend/.coverage` (untrack or accept), `django_ci.yml` silent duplicate
   (retire or fix).
8. **Orchestrator sequence → PR:** re-measure porcelain at commit time (sibling lanes
   were mid-flight; B5 warns `git reset` before any scoped add given the 8,724 staged
   venv paths — or commit them first), commit in scoped units, push
   `wave/nextjs-migration` (no upstream yet), open PR, shepherd CI (both workflows
   path-correct), merge after owner review. Harness-side commits follow
   `HARNESS-COMMIT-PLAN_2026-09-22.md` (9 scoped commits; run `sync_shared_state.ps1`
   first per B4).
9. **wf2 leftovers:** B2 (G-8b reader/writer live resolution) must run from the MAIN
   session — dispatch tools are structurally absent in workflow subagents; G-4
   depth-cap re-adjudication still open (B4 encoded the context); B3-class live
   hook-firing probe likewise main-session work. A6/B3 were never dispatched this run.

---

## 6. Residual honesty notes

- A4 disclosed PostToolUse SENSITIVE-ARTIFACT hook reports (ids sha256:f5358e8f…,
  sha256:51a4f1528d72) on test-file edits — no credential material in the edits;
  report-only, surfaced for the owner.
- B1's docker-image existence and negative controls are lane-measured with receipts in
  `B1-container-run-report.md` (re-read by this unit); this unit did not invoke docker.
- A3's lock-file claim (no installable `@vitest/coverage-v8` entry in package-lock.json)
  is lane-measured; this unit independently confirmed the package.json half only.
- The A6/B3 scope labels are this unit's inference from the wave/wf2 gap lists — the
  run journal contains no lanes under those ids. If the orchestrator intended different
  scopes for A6/B3, re-dispatch.
- Concurrent-edit hazards flagged by A1/A4/B5 (submissions test file edited at 21:29:44
  mid-sweep; lanes mutating the tree in parallel) — the re-measured state in §3 is the post-flight truth, but re-verify at commit time.

*Generated 2026-09-22 ~22:10 by `report:dossier` (wf_4c7f6644-d3f). No git write
operations performed; the only file written by this unit is this dossier.*
