# WebCoder — Tech Stack (living document)

Last updated: 2026-10-24 · Status legend: ✅ shipped · 🚧 in flight (roadmap program `dwfrun-e33e0c0f`)

## Frontend — web (branch `main`, repo root)

| Layer | Technology | Notes / status |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 | ✅ SSR problem catalog, dynamic routes |
| Language | TypeScript (strict) | ✅ tsc clean gate |
| UI kit | MUI 9 + design tokens SSOT (`src/theme/tokens.ts`) | ✅ token gate test enforces no raw hex |
| i18n | i18next + next-intl, message catalogs | ✅ RO/EN parity test · 🚧 10 languages (i18n wave) |
| Auth client | httpOnly-cookie JWT (credentials:include) + CSRF seeding | ✅ zero localStorage tokens |
| State | React context (AuthContext) + fetch service layer (`ApiService`) | ✅ |
| Editor | textarea-based (Tab indent, Ctrl-Enter, templates) | ✅ interim · 🚧 CodeMirror 6 (backlog E-73) · 🚧 locked regions (judge-fairness wave) |
| Block editor | Blockly (Scratch-style) → generates JS/Python → normal judge | 🚧 judge-fairness wave |
| Tests | Vitest + Testing Library (jsdom) · Playwright (mock mode + real-backend mode via E2E_API_BASE) · axe a11y · viewport suites | ✅ CI-gated · coverage gate 100% lines 🚧 |
| Quality | eslint (0 errors gate) + design-token drift gate | ✅ |

## Backend — API (branch `backend`)

| Layer | Technology | Notes / status |
|---|---|---|
| Framework | Django 5.2 + Django REST Framework | ✅ |
| Auth | SimpleJWT (httpOnly cookies, rotation+blacklist), dj-rest-auth 7 + allauth (Google/GitHub OAuth) | ✅ CSRF + rate limiting ✅ |
| Roles | BASIC / CREATOR / VERIFIER / ADMIN (permissions.py) | ✅ |
| Async | Celery + Redis broker (worker service in compose) | ✅ |
| DB | PostgreSQL 16 | ✅ cursor + page pagination ✅ |
| Apps | problems · submissions · users · leaderboard · notifications · forum | ✅ · 🚧 contests/classroom/translations (waves B/C + i18n) |
| Judge pipeline | docker-exec into sandboxed `webcoder-judge-runner` (shared /srv/judge volume, network=none, read-only, cap-drop ALL, uid 1000) | ✅ |
| Languages | python3 · cpp17 · java11 (--release 11) · c11 · nodejs20 | ✅ · 🚧 Pascal + Go/Rust/C#/Ruby/Kotlin/Lua/PHP/Haskell (judge-fairness wave) |
| Fairness | per-language time+memory multipliers; per-problem library/feature policy | 🚧 judge-fairness wave |
| Problem types | full-code · partial-code (locked regions, server-verified) | 🚧 judge-fairness wave · output-only/interactive/subtasks = backlog A-1..3 |
| AI curator | provider-agnostic screen() adapter, OpenAI-compatible HTTP via env, fail-open | 🚧 i18n wave |
| Tests | pytest + pytest-django, sqlite settings_ci, **100% line coverage gate** | ✅ |

## Infrastructure & ops

| Area | Technology | Notes / status |
|---|---|---|
| Local/dev stack | docker compose: postgres + redis + backend(:8000) + celery-worker + judge-runner; override files (ports, custom-libs pypiserver, socket-proxy variant) | ✅ RUNBOOK.md |
| Images | backend (python:3.11-slim + docker-cli), judge-runner (+g++, OpenJDK, Node, gcc) | ✅ |
| CI | GitHub Actions: Unit Tests (Vitest) · E2E (Playwright) · CodeQL; branch protection + quality ruleset | ✅ |
| Security | sandbox receipts, throttles (auth/submit), verdict-forge backdoors removed, E1 network-none | ✅ · backups sidecar + restore drill 🚧/backlog J |
| Deploy | Not yet deployed (owner-deferred); Vercel/compose paths documented | ⏳ production lane |

## Mobile (🚧 in flight — mobile wave)

| Area | Technology |
|---|---|
| App | Expo (React Native + TypeScript), one codebase → Google Play + App Store |
| Feature parity | auth, catalog, submit+verdicts, leaderboard, forum, notifications; 10-language catalogs |
| Tests | jest + @testing-library/react-native (100% services layer), Maestro flows |
| Store kit | eas.json, fastlane, RO/EN listings, privacy page |

## Working conventions

- Protected PRs only (never direct pushes); squash-merge; checks must be green.
- Every PR: backend pytest 100%-module-coverage / frontend vitest+tsc+lint+build+e2e.
- Docs live in `docs/` — this file, `ROADMAP.md` (layered plan), `BACKLOG.md` (item tracker), `RUNBOOK.md` (ops), `SPEC-GAPS.md`, `ROADMAP-COMPETITIVE-2026-10-22.md` (research basis).
