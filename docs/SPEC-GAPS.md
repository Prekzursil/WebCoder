# WebCoder Spec Gaps — 2026-10-21 (Lane 0 audit)

Method: original product spec (exported "WebCoder Implementation Plan" chat, 2023-11) diffed against main @ `4cf2d057` (frontend) and backend branch @ `71200023` (Django API), plus compose/Dockerfiles/settings reads. Every gap carries evidence. This file is the tracked scope for Lanes 2–5; items close with a PR reference when done.

## Implemented and verified (no action)

| Spec item | Where | Evidence |
|---|---|---|
| Roles: admin / verifier / creator / basic | backend `users/permissions.py` (48 stmts, 100% cov) + role-gated UI | backend test suite; admin problem-queue page |
| Email/password auth + JWT refresh | dj_rest_auth + simplejwt; frontend `ApiService.apiFetch` single-flight refresh | src/services/ApiService.ts:30-118 |
| Google/GitHub OAuth + username selection | backend `users/api/oauth/{google,github}`; frontend `complete-registration` flow | API-MAP.md §OAuth |
| Problems CRUD + tags + testcases + approval UI | `/api/v1/problems/*`; admin problem-queue page | API-MAP.md; src/app/admin/problem-queue |
| Submissions + Celery judge (local AND container) | `submissions/tasks.py`, `judge_utils/`, `Dockerfile.judge` | 499 BE tests; compose judge-runner service |
| Inline code editor (not a full IDE) | textarea-based submit on problem detail | src/app/problems/[problemId]/page.tsx |
| Judge languages python3 / cpp17 / java11 | Dockerfile.judge toolchains | backend/Dockerfile.judge:8-15 |
| RO/EN i18n | i18next + next-intl wiring | src/i18n.ts (completeness sweep = Lane 3) |
| Admin dashboard | `/users/admin/stats/` + dashboard page | ApiService endpoint list |
| Tests/CI | 298 FE unit + 8 e2e + 499 BE (100% cov); vitest/e2e/CodeQL workflows green on main | CI run history |

## Gaps → lane mapping

| # | Gap | Evidence | Lane |
|---|---|---|---|
| G1 | **Forum has no backend** (models/endpoints/permissions/moderation); UI fully built over mock data | no forum paths in ApiService; src/app/forum/** mock | 2a |
| G2 | **Leaderboard mock** — no aggregation endpoint (score/solved/success-rate) | MOCK_LEADERBOARD in src/app/leaderboard/page.tsx:16 | 2b |
| G3 | **Notifications mock** — no model/endpoint | src/app/notifications/page.tsx | 2c |
| G4 | **No pagination** on any list endpoint (problems/submissions return full queryset) | API-MAP.md global conventions | 2d |
| G5 | **Celery not containerized**: `celery.py` hardcodes filesystem broker; no celery-worker compose service; redis service unused | settings.py:269-275; compose comments | 2e |
| G6 | **Frontend absent from compose** (placeholder comment); deploy story needs it or external Node host | docker-compose.yml frontend block | 2e/5 |
| G7 | **Approval workflow never validated live** — backend permissions + queue UI exist but the creator→verifier→visible loop has only unit tests | backend tests; no real-stack e2e | 1 → 2e |
| G8 | **Prod settings profile missing**: DEBUG=True, ALLOWED_HOSTS=[], CORS= localhost:3000 only, fail-loud SECRET_KEY/DB_PASSWORD | settings.py:35,38-40,87-90 | 4/5 |
| G9 | **E1 CRITICAL**: python3+custom-lib judged programs get FULL bridge networking | SECURITY-AUDIT-judge.md via DEPLOY.md gate 1 | 4 |
| G10 | **E7**: verdict-forge triggers (`tle_trigger`/`mle_trigger`/`re_trigger`) not stripped | DEPLOY.md gate 2 | 4 |
| G11 | **JWT in localStorage** → httpOnly-cookie migration | ApiService.ts:33-35 note; DEPLOY.md gate 3 | 4 |
| G12 | **docker.sock in backend container** = root-equivalent; socket-proxy is the hardened path | compose backend service comment | 5 |
| G13 | Responsive/a11y/i18n-completeness QA never systematically run (old login chat reported overlapping fields) | ChatGPT "Login Issues" export 2025-06 | 3 |
| G14 | Real-backend e2e mode absent (suite is mock-api only) | e2e/mock-api; playwright.config | 1 |

Not gaps (explicitly out of spec scope): additional judge languages beyond python3/cpp17/java11 (spec said "at least two initially"); full IDE features.
