# WebCoder — Tech Stack (living document)

Last updated: 2026-11-20 (post waves E/F/G + the polish sweep) · Status legend: ✅ shipped · 🚧 in flight · ⏳ deferred

**Repo layout (single branch):** `main` is the one and only branch — a monorepo with the Next.js app at the repo **root** (`src/`, `package.json`, root configs) **plus** `backend/` (Django + Dockerfiles), `docker-compose.yml` (+ hardening overlays) and root-level gates (`pytest.ini`, `pyproject.toml`, `scripts/verify`). The former `backend` branch was merged in with a true merge commit on 2026-10-27 and retired under tag `archive/backend-branch-2026-10-26`. Everything targets `main`.

## Frontend — web (repo root on `main`)

| Layer | Technology | Notes / status |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 | ✅ SSR problem catalog, dynamic routes |
| Language | TypeScript (strict) | ✅ tsc clean gate |
| UI kit | MUI 9 + design tokens SSOT (`src/theme/tokens.ts`) | ✅ token gate test enforces no raw hex |
| i18n | i18next + next-intl, message catalogs | ✅ RO/EN parity test · ✅ 12 UI locales (i18n-10 wave); problems carry 12-locale title/statement JSON (EN mandatory fallback) |
| Auth client | httpOnly-cookie JWT (credentials:include) + CSRF seeding | ✅ zero localStorage tokens |
| State | React context (AuthContext) + fetch service layer (`ApiService`) | ✅ |
| Editor | textarea-based (Tab indent, Ctrl-Enter, templates) | ✅ interim · 🚧 CodeMirror 6 (backlog E-73) · 🚧 locked regions (judge-fairness wave) |
| Block editor | Blockly AND Scratch engines → generated/transpiled Python → normal judge pipeline | ✅ (see docs/BLOCK-PROGRAMMING.md) |
| Tests | Vitest + Testing Library (jsdom) · Playwright (mock mode + real-backend mode via E2E_API_BASE) · axe a11y · viewport suites | ✅ CI-gated · coverage gate 100% lines 🚧 |
| Quality | eslint (0 errors gate) + design-token drift gate | ✅ |

## Backend — API (`backend/` on `main`)

| Layer | Technology | Notes / status |
|---|---|---|
| Framework | Django 6.1 + Django REST Framework | ✅ |
| Auth | SimpleJWT (httpOnly cookies, rotation+blacklist), dj-rest-auth 7 + allauth (Google/GitHub OAuth) | ✅ CSRF + rate limiting ✅ |
| Roles | BASIC / CREATOR / TEACHER / VERIFIER / ADMIN (permissions.py) | ✅ |
| Async | Celery + Redis broker (worker service in compose) | ✅ |
| DB | PostgreSQL 16 | ✅ cursor + page pagination ✅ |
| Apps | problems · submissions · users · leaderboard · notifications · forum · contests · ratings · classroom · messaging · translations · learning · community_depth · recognition · partnerships · analytics · certificates · integrity · ops · public_api · publishing · scratch · control | ✅ (~25 apps) |
| Judge pipeline | docker-exec into sandboxed `webcoder-judge-runner` (shared /srv/judge volume, network=none, read-only, cap-drop ALL, uid 1000) | ✅ |
| Languages | C · C++17 · Python 3 · Java 21 · JavaScript (Node) · Go · C# (Mono) · Pascal — registry-driven with pinned toolchains published on /api/v1/public/languages/ | ✅ |
| Fairness | per-language time+memory multipliers + per-problem overrides; per-test time bars persisted on result rows; per-problem library/feature policy | ✅ (judge-fairness wave) |
| Problem types | full-code · partial-code (locked regions, server-verified) · output-only · interactive (interactor protocol) · subtask scoring · file-I/O mode | ✅ |
| AI curator | provider-agnostic screen() adapter, OpenAI-compatible HTTP via env, fail-open, OFF by default | ✅ (i18n wave; RUNBOOK §ai-curator) |
| Tests | pytest + pytest-django, sqlite settings_ci, **100% line coverage gate** | ✅ |

## Infrastructure & ops

| Area | Technology | Notes / status |
|---|---|---|
| Local/dev stack | docker compose: postgres + redis + backend(:8000) + celery-worker + judge-runner; override files (ports, custom-libs pypiserver, socket-proxy variant) | ✅ RUNBOOK.md |
| Images | backend (python:3.11-slim + docker-cli), judge-runner (+g++, OpenJDK, Node, gcc) | ✅ |
| CI | GitHub Actions (single-branch, both suites per push/PR): Frontend CI (lint zero-warnings + build + vitest/coverage) · Django CI (`backend/**` paths, pytest 100% line cov via `--cov-fail-under=100`, sqlite settings_ci) · E2E (Playwright) · Verify (both stacks via `scripts/verify`) · quality (lean 6-gate) · CodeQL | ✅ |
| Security | sandbox receipts page, throttles (auth/submit/scratch/guest), verdict-forge backdoors removed, E1 network-none, socket-proxy default | ✅ backups sidecar + restore drill + status page + blue-green + load harness ✅ (J wave) |
| Deploy | Not yet deployed (owner-deferred); Vercel/compose paths documented | ⏳ production lane |

## Mobile (🚧 in flight — mobile wave)

| Area | Technology |
|---|---|
| App | PWA (manifest + service worker + offline packs) as the shipped mobile lane; Expo packages under mobile/ (store submission owner-deferred) |
| Feature parity | offline statement packs, streaks widget surface, QR classroom join, tablet layout (web) · push notifications/offline drafts wired for the store build |
| Tests | jest + @testing-library/react-native (100% services layer), Maestro flows |
| Store kit | eas.json, fastlane, RO/EN listings, privacy page |

## Working conventions

- **Single branch**: every PR targets `main` (no other base). Protected PRs only (never direct pushes); default squash-merge; checks must be green. True (non-squash) merge commits are reserved for history-preserving operations (e.g. the 2026-10-27 unification).
- Every PR, both suites from the repo root: backend `SECRET_KEY=x DB_PASSWORD=x python -m pytest -q` (100% line coverage, warning-clean) / frontend `npm run test` + `npx tsc -p tsconfig.json --noEmit` + `npm run lint` (0 errors AND 0 warnings) + `npm run build` + `npx playwright test` (mock mode).
- Docs live in `docs/` — this file, `ROADMAP.md` (layered plan), `BACKLOG.md` (item tracker), `RUNBOOK.md` (ops), `SPEC-GAPS.md`, `ROADMAP-COMPETITIVE-2026-10-22.md` (research basis).
