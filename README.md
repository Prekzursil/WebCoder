# WebCoder

WebCoder is a competitive-programming judge platform: a problem catalog, a
submission flow, and sandboxed evaluation of submitted code.

## Repository layout

Since the 2026-09 restructure, `main` holds the JavaScript/TypeScript
frontend only. The Django backend is preserved on a separate branch and is
not part of the default checkout.

| Component | Stack | Where |
|---|---|---|
| Frontend | Next.js 15 App Router, React 19, MUI 9, i18next / next-intl | repo root, `main` |
| Backend | Django REST Framework (`/api/v1/`), Celery, PostgreSQL, JWT (dj_rest_auth) + Google/GitHub OAuth | `backend` branch (preserved) |
| Judge runner | Sandboxed Docker image: non-root, `cap-drop ALL`, `no-new-privileges`, memory caps, `--network none` | `JUDGE_BACKEND=container` toggle, see `docs/DEPLOY.md` |

Frontend routes on `main` (under `src/app/`): problems catalog, detail and
create; submissions list and detail; my-submissions / my-created-problems;
register, login, complete-registration, profile; admin dashboard and problem
queue.

The frontend talks to the backend over
`NEXT_PUBLIC_API_BASE` (default `http://localhost:8000`). The backend's CORS
allowlist currently covers `http://localhost:3000` only (`docs/API-MAP.md`).

## Quickstart

Requires Node.js. From the repo root:

```bash
npm install     # install dependencies
npm run dev     # dev server on http://localhost:3000 (next dev --turbopack)
npm test        # vitest unit/component test suite
npm run lint    # eslint
```

`npm run build` / `npm start` build and serve the production app. All routes
are server-rendered (dynamic) — static export is not supported.

To run against a local backend, check out the `backend` branch and follow
`docs/DEPLOY.md` (Path B: docker compose brings up postgres + redis +
backend + judge-runner). `JUDGE_BACKEND=container` routes judged code through
the sandboxed Docker image; the default `local` mode runs judged commands on
the host and is for development only. Read the security gates in
`docs/DEPLOY.md` before exposing an instance publicly.

Playwright e2e tests live in `e2e/` (`npx playwright test`).

## Docs

Evidence-anchored documentation lives in `docs/`:

- `docs/API-MAP.md` — DRF endpoint map (auth matrix, serializers, Celery tasks)
- `docs/INFRA-MAP.md` — infrastructure inventory (CI workflows, venv, pytest config)
- `docs/DEPLOY.md` — deployment runbook (Vercel + Django host, or docker compose)
- `docs/PORT-MAP.md` — CRA-to-Next port map from the migration wave
- `docs/SECURITY-AUDIT-judge.md`, `docs/SECURITY-AUDIT-auth.md`, `docs/SECURITY-judge-recon.md` — security audits
- `docs/WAVE-DECISIONS.md`, `docs/WAVE-REPORT_2026-09-22.md` — CRA-to-Next 15 migration decisions and report
- `docs/DELIVERY-DOSSIER_2026-09-22.md`, `docs/API-ENVELOPE-RECEIPT.md`, `docs/BENCH-i18n-gaps.md`, `docs/ci-both-states-proof_2026-09-22.md` — supporting wave artifacts

`SECURITY.md` at the repo root covers vulnerability reporting.
