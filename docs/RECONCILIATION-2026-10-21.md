# WebCoder Reconciliation & Audit — 2026-10-21

> **Provenance.** Full-drive filename scans of `C:\` and `D:\` (case-insensitive `*webcoder*`), GitHub API/git recon of `Prekzursil/WebCoder` (all 17 remote branches, 146 PR refs, 2 tags), local verification runs (vitest, tsc, eslint, next build) in the canonical clone, and git-ancestry checks on every stray working copy found on disk. Every verdict below carries its evidence. Raw scan outputs live outside the repo (session workspace `scan/`).

## 1. Executive summary

- **The project works.** `main` @ `5dbe022e` builds cleanly, typechecks cleanly, lints with 0 errors, and passes 297/298 vitest tests (the 1 failure is flaky under parallel load — passes 9/9 in isolation; see §4.5).
- **The merge pipeline is dead** — this is the one real operational regression. Branch protection (classic + active ruleset `quality-zero-platform / WebCoder` #14488879) requires the `quality / quality` check (QZP App, integration 15368), but **no run of that check exists on any recent commit** — not on `main` HEAD, not on either open PR. Result: every PR is `BLOCKED` with nothing failing. PR #170 (Next 15.5.28, contains a **critical security fix**) has been stuck since 2026-10-16.
- **No unique work was stranded on disk.** Both stray full copies (`D:\sast-depth\WebCoder`, `C:\Users\Prekzursil\webcoder_clean`) are clean, fully-merged clones. One commit (`f3ef394e`, QZP-SaaS purge, June 26) existed only in `webcoder_clean` — now fetched into this clone under `refs/remotes/webcoderclean/*` + tag `rescue/C4-ruff-cleanup-workflow-permissions-20260801`. Nothing else unique anywhere.
- **Housekeeping debt, not code debt:** stale `dependabot.yml` (watches two directories deleted by the #167 restructure), boilerplate README, stale paths in `docs/DEPLOY.md`, 12 stale/merged branches (now archived under local `archive/2026-10-21/*` tags).

## 2. What WebCoder is

A competitive-programming judge platform (mini-judge: problems, submissions, sandboxed evaluation, leaderboard):

- **Frontend (this branch, `main`):** Next.js 15 App Router at repo root, React 19, MUI 9, i18next/next-intl, vitest (298 tests) + Playwright e2e. Routes: problems catalog/detail/edit, submissions, submission history, register/login/OAuth, profile, notifications, forum, leaderboard, admin (dashboard + problem queue).
- **Backend (preserved on `backend` branch @ `71200023`):** Django REST Framework (`/api/v1/`), JWT (dj_rest_auth) + Google/GitHub OAuth, `problems`/`submissions`/`users` apps, Celery async judging, PostgreSQL (port 5433 local), CORS for `localhost:3000`. See `docs/API-MAP.md` (evidence-anchored).
- **Judge runner:** sandboxed Docker image (non-root, cap-drop ALL, no-new-privileges, `--network none`); `JUDGE_BACKEND=container|local` toggle. Image backup: `D:\Backups\docker-volumes\images\img-webcoder-judge-runner_latest.tar` (283 MB).
- **Governance:** quality-zero-platform App + rulesets, CodeQL, dependabot; history of 170 PRs; modernization wave #152 (CRA→Next 15 port, 295-test suite, 2026-09-28) followed by restructure #167 (`main` = JS/TS only; backend preserved on branch — verified: `origin/backend` is an ancestor of `main`, nothing lost).

## 3. Local verification (regression check) — 2026-10-21, canonical clone

| Check | Result | Evidence |
|---|---|---|
| `vitest run` (full suite) | **297/298 pass**, 1 flaky fail | `src/app/register/page.test.tsx:201` under parallel jsdom load; 9/9 pass in isolation |
| `tsc --noEmit` | clean, exit 0 | — |
| `eslint` | 0 errors, 1 warning | warning comes from local-only untracked `.remember/tmp/last-ndc.ts` scratch (not repo content) |
| `next build` | success, full route table | all routes dynamic SSR; First Load JS ~160 kB shared |
| CI on `main` | CodeQL scheduled green through 2026-10-20; **last `frontend.yml` run on main = #167 merge (2026-09-28)**; the #168 merge commit `5dbe022e` never got a CI run | `gh run list` |
| Open PR checks | #169: CodeQL/vitest/Analyze all **pass**; #170: only CodeQL (skipping) | `gh pr checks` |

## 4. Defects & risks found

### 4.1 Merge pipeline dead (blocker)
Required checks `quality / quality` (integration 15368) + `CodeQL` are enforced twice — classic branch protection on `main` **and** active ruleset 14488879 (`pull_request`, `required_status_checks`, `non_fast_forward`, `deletion`). The QZP App check has not been reported on any commit since the platform went lean (App repo `quality-zero-platform` last pushed 2026-10-02, still active as a repo — the *check delivery* to this repo is what stopped). Both open PRs are `BLOCKED` indefinitely.
**Fix options (pick one):** (a) re-arm the QZP App for this repo; (b) drop `quality / quality` from both the classic protection and ruleset 14488879, keeping `CodeQL` + the `vitest` check that PR #169's new `.github/workflows/vitest.yml` provides. Option (b) is the lean-gate-consistent recommendation.

### 4.2 Security update stuck (consequence of 4.1)
PR #170 bumps `next` 15.5.25→15.5.28 (critical advisory) + postcss. Tests pass; blocked only by the missing quality check. Merge promptly after 4.1 is resolved.

### 4.3 `dependabot.yml` stale after restructure
Config watches `pip:/backend` and `npm:/frontend/webcoder_ui` — **both directories deleted from `main` by #167** — and has no `npm:/` entry for the root Next.js app. Effect: recurring failed updater runs (`pip in /backend`, `npm_and_yarn in /frontend/webcoder_ui`) every schedule; root npm updates arrive only via security-driven PRs (e.g. #170).
**Fix:** rewrite to `npm: /` + `github-actions: /` (pip returns only if/when backend re-merges to a default-branch path).

### 4.4 Documentation drift
- `docs/DEPLOY.md` says `cd frontend/web` — the app is at repo root since #167.
- `README.md` is stock create-next-app boilerplate; the real project story lives in `docs/` (API-MAP, INFRA-MAP, WAVE-REPORT, SECURITY-AUDITs).
- (Docs otherwise carry excellent branch/evidence tagging.)

### 4.5 Flaky test
`src/app/register/page.test.tsx` parametrized "surfaces the API failure" cases assert `routerMock.push` not called; under full-suite parallel load a redirect assertion can bleed (jsdom churn: 32 environments, 216 s). Passes 9/9 isolated. PR #169 already rewrites this file; if it stays flaky, harden the mock reset in `beforeEach`.

### 4.6 Branch hygiene
12 stale/merged branches; all now covered by local tags `archive/2026-10-21/*` (commits stay reachable after branch deletion). `backend` and `archive/pre-lean-gate` are intentional keeps.

## 5. Branch reconciliation (2026-10-21)

| Branch | Last commit | vs main | Verdict |
|---|---|---|---|
| `main` | 2026-09-28 `5dbe022e` | — | default; healthy |
| `backend` | 2026-09-28 `71200023` | ancestor of main | **KEEP** — preserved Django line |
| `rocket-update` | 2026-09-29 | +11 commits | LIVE — PR #169 (54 files, +5658/−2086, all checks pass; medium-risk Rocket UI sweep incl. graceful API-failure handling; review then merge) |
| `dependabot/npm_and_yarn-113f7135cf` | 2026-10-16 | +1 | LIVE — PR #170 (security) |
| `master` | 2025-06-15 | merged | delete (tagged) |
| `fix/ui-audit-a11y-safe-fixes` | 2026-06-30 | merged | delete (tagged; `rescue/e4ce67e7` already existed) |
| `archive/pre-lean-gate` | 2026-03-30 | merged | KEEP (explicit archive) |
| `chore/governance-wave2-bootstrap` | 2026-02-19 | +17 | delete (tagged; pre-restructure) |
| `feat/lean-quality-gate` | 2026-06-21 | +33 | delete (tagged; superseded by lean-gate rollout) |
| `feat/quality-zero-gates-2026-03-03` | 2026-03-03 | +6 | delete (tagged) |
| `feat/quality-zero-platform-rollout` | 2026-03-16 | +3 | delete (tagged; QZP repo carries the platform forward) |
| `copilot/implement-queue-hardening` | 2026-02-20 | +4 | delete (tagged; old-layout queue work, superseded) |
| `chore/leveraged-fix-ruff-py-autofix` | 2026-06-05 | +2 | delete (tagged) |
| `codex/strict-21-100-webcoder` | 2026-03-03 | +1 | delete (tagged) |
| `feat/codecov-upload-resilience-2026-03-03` | 2026-03-03 | +1 | delete (tagged) |
| `evidence/ab-main-probe`, `evidence/ab-v1-control` | 2026-07-25 | +1 each | delete (tagged; A/B probes, evidence preserved in tag) |

All pre-restructure unmerged branches target files that no longer exist on `main`; their value is historical (kept via tags). Nothing unique was lost — verified by ancestry + PR cross-check (`dca60f5` = PR #120 content, merged).

## 6. Working-copy reconciliation

| Copy | State | Verdict |
|---|---|---|
| `C:\Users\Prekzursil\Documents\GitHub\WebCoder` | clean, `main` == origin, all branches + 146 PR refs + tags fetched | **CANONICAL** |
| `D:\sast-depth\WebCoder` (40 MB) | clean; branch `fix/sast-depth-…` tip `dca60f5` = already in main (PR #120) | redundant — removed after this doc |
| `C:\Users\Prekzursil\webcoder_clean` (41 MB) | clean; `main` in origin/main; 1 unique commit `f3ef394e` (QZP-SaaS purge, targets deleted files) — preserved here via `webcoderclean/*` refs + existing rescue tag | redundant — removed after this doc |

## 7. Disk traces — inventory & disposition

**Keep (memory/knowledge/config systems):** `D:\basic-memory\*` + `D:\.basic-memory\backups\*` + `D:\Backups\basic-memory\mirror\*` and their C: mirrors (`~\.basic-memory\backups\*`, `~\.agents\knowledge\vault-export\*`) — semantic-memory notes about webcoder; `~\.claude\*` / `~\.claude-free\*` event ledgers, project session stores and workflow scripts; `D:\agent-sessions-vault\stores\*` and `~\Downloads\AIs Conversations\ChatGPT\_site\*` (original ChatGPT implementation-plan exports, html+md); `~\Downloads\BACKUPS VM\*` (deliberate VM backups 2026-09-25/27); `~\.local\opt\mcp_agent_mail\store\*` (agent-mail archive); AppData caches (claude-cli, VS Code PR extension). Quality-platform config sprawl — **seven** qzp working dirs across drives: `D:\qzp-cve\`, `D:\qzp-wct\`, `D:\sast-depth\qzp\`, `C:\qzp-20260627-221454\`, `~\.scratch\qzp-277\`, `qzp-cxdup\`, `qzp-gate\` (the canonical platform repo is `Documents\GitHub\quality-zero-platform`) — consolidation/deletion of the scratch copies is the platform owner's call, not this repo's.

**Moved into this repo:** 5 UI-audit screenshots from the home root (`webcoder-home-desktop.png`, `webcoder-home-mobile-390.png`, `webcoder-login-desktop.png`, `webcoder-login-desktop-postfix.png`, `webcoder-problems-error-state.png`) → `docs/screenshots/ui-audit-2026-06/`.

**Deleted (verified redundant, this run):** `D:\sast-depth\WebCoder`, `C:\Users\Prekzursil\webcoder_clean` (see §6).

**Deletion candidate (owner decision):** `D:\Backups\docker-volumes\images\img-webcoder-judge-runner_latest.tar` (283 MB) — judge-runner image backup; Docker daemon not running to verify a live copy; image is rebuildable from the backend branch's Dockerfile. Recommend: verify `docker images` has `img-webcoder-judge-runner` (or rebuild), then delete the tar.

**Local-only scratch inside canonical clone (harmless, gitignored):** `.remember/tmp/last-ndc.ts` (lint warning source), `.next/` build cache, `node_modules/`.

## 8. Recommended next steps (priority order)

1. **Unblock merging** — resolve the required-check deadlock (§4.1; recommendation: drop `quality / quality`, keep `CodeQL` + `vitest`).
2. **Merge PR #170** (critical Next security fix) immediately after.
3. **Review & merge PR #169** (Rocket sweep; checks green; medium-risk — eyeball the error-swallowing noted in its body, and the new `vitest.yml` makes `vitest` a proper named check).
4. **Fix `dependabot.yml`** (§4.3) in the same wave.
5. **Docs pass:** rewrite `README.md` from §2; fix `DEPLOY.md` paths (`frontend/web` → repo root); date-stamp.
6. **Delete the 12 tagged stale branches** on the remote (`git push origin --delete …` after pushing the `archive/2026-10-21/*` tags).
7. **Harden the flaky register test** if it reappears after #169.
8. Optional: push this reconciliation branch and the archive tags; empty-recycle-bin the deleted copies when convenient.

## 9. Method appendix

- Drive scans: `find /c,/d -iname '*webcoder*'` (full) + native `dir /s /b` cross-check; **D: complete: 55 raw hits, 0 errors; C: complete: 144 raw hits, 2,279 transient errors (container-layer/permission noise, no unreadable areas of consequence)**. Net result: the only working copy on C: is the canonical clone; the only other working copies found anywhere were the two redundant ones removed in §6.
- GitHub: `gh api` (branches, rulesets, check-runs, PRs, contents), `git ls-remote`, PR list to #170.
- Ancestry: every stray copy fetched into the canonical clone; `merge-base --is-ancestor` + `rev-list --count` per branch; unique commits inspected (`git show`).
- Health: `vitest run`, `tsc --noEmit`, `eslint`, `next build` in the canonical clone on `main` @ `5dbe022e`.
