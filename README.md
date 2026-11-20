# WebCoder

WebCoder is a bilingual (RO/EN + 10 more UI locales) competitive-programming
platform: a ~1 800-problem catalog mapped on the national curriculum, a real
code editor with instant sandboxed judging, rated contests with Glicko
ratings, classrooms and assignments for teachers, forums/messaging/wiki,
and a full learning layer (hints, editorials, spaced repetition, courses).

## Repository layout

`main` is the one and only branch — a monorepo (unified 2026-10-27; the old
`backend` branch is retired under tag `archive/backend-branch-2026-10-26`):

| Component | Stack | Where |
|---|---|---|
| Frontend | Next.js 16 App Router, React 19, MUI 9, i18next / next-intl (12 locales), CodeMirror 6 + Blockly/Scratch | repo root, `src/` |
| Backend | Django 6 + DRF (`/api/v1/`), Celery + Redis, PostgreSQL 16, httpOnly-cookie JWT (dj-rest-auth) + Google/GitHub/Microsoft OAuth | `backend/` (~25 apps) |
| Judge runner | Sandboxed Docker: `--network none`, read-only mounts, `cap-drop ALL`, uid 1000; C/C++/Python/Java/JS/Go/C#/Pascal; reached only through a filtering socket-proxy | `backend/Dockerfile.judge`, `JUDGE_BACKEND=container` |
| Mobile | PWA (offline packs, push) + Expo packages under `mobile/` (store submission owner-deferred) | `mobile/` |

The frontend talks to the backend over `NEXT_PUBLIC_API_BASE`
(default `http://localhost:8000`; cookies travel with credentials).

## Quickstart

```bash
npm install     # install dependencies
npm run dev     # dev server on http://localhost:3000 (next dev --turbopack)
npm test        # vitest unit/component suite
npm run lint    # eslint — zero warnings policy
```

For the full stack (postgres + redis + backend + judge + beat + backups):

```bash
cp backend/.env.example .env   # SECRET_KEY, POSTGRES_PASSWORD
docker compose up --build -d   # Mode A — see docs/RUNBOOK.md
```

`JUDGE_BACKEND=container` routes judged code through the sandboxed runner
(the compose default); `local` runs judged commands on the host, dev only.
Read the security gates in `docs/DEPLOY.md` before exposing an instance.

Playwright e2e lives in `e2e/` — hermetic mock mode (`npx playwright test`)
or against the live stack (`E2E_API_BASE=http://127.0.0.1:8010 npx playwright test`).

## Guides (bilingual, multi-format)

| Guide | English | Română |
|---|---|---|
| Architecture | [guide-en/ARCHITECTURE](docs/guide-en/ARCHITECTURE.md) | [guide-ro/ARHITECTURA](docs/guide-ro/ARHITECTURA.md) |
| Contributing | [guide-en/CONTRIBUTING](docs/guide-en/CONTRIBUTING.md) | [guide-ro/CONTRIBUIE](docs/guide-ro/CONTRIBUIE.md) |
| User guide | [guide-en/USER-GUIDE](docs/guide-en/USER-GUIDE.md) | [guide-ro/GHID-UTILIZATOR](docs/guide-ro/GHID-UTILIZATOR.md) |
| Teacher guide | [guide-en/TEACHER-GUIDE](docs/guide-en/TEACHER-GUIDE.md) | [guide-ro/GHID-PROFESOR](docs/guide-ro/GHID-PROFESOR.md) |
| Admin guide | [guide-en/ADMIN-GUIDE](docs/guide-en/ADMIN-GUIDE.md) | [guide-ro/GHID-ADMIN](docs/guide-ro/GHID-ADMIN.md) |
| Security | [guide-en/SECURITY](docs/guide-en/SECURITY.md) | [guide-ro/SECURITATE](docs/guide-ro/SECURITATE.md) |
| Block programming | [guide-en/BLOCK-PROGRAMMING](docs/guide-en/BLOCK-PROGRAMMING.md) | [guide-ro/PROGRAMARE-PE-BLOC](docs/guide-ro/PROGRAMARE-PE-BLOC.md) |

Each guide also ships as `.pdf` / `.docx` / `.tex` under
[`docs/dist/`](docs/dist/) — regenerate everything with
`docs/build-docs.ps1` (Windows) or `docs/build-docs.sh` (POSIX).
Diagrams: [`docs/diagrams/`](docs/diagrams/).

## Docs

Evidence-anchored documentation lives in `docs/`:

- `docs/RUNBOOK.md` — env/ops runbook (live stack, backups, e2e modes, content-ops commands)
- `docs/ROADMAP.md` — the layered product roadmap (status view)
- `docs/BACKLOG.md` — the item-level tracker of record
- `docs/SPEC-GAPS.md` + `docs/ROADMAP-COMPETITIVE-2026-10-22.md` — platform backlog + competitive research basis
- `docs/TECH-STACK.md` — the living stack inventory
- `docs/API-MAP.md`, `docs/INFRA-MAP.md`, `docs/PORT-MAP.md` — maps
- `docs/DEPLOY.md` — deployment paths
- `docs/SECURITY-AUDIT-*.md`, `docs/SECURITY-judge-recon.md` — security audits
- `docs/DECISION-OPEN-SOURCE.md`, `docs/DPA-TEMPLATE.md` — decisions & templates
- `docs/WAVE-DECISIONS.md`, `docs/WAVE-REPORT_2026-09-22.md`, `docs/DELIVERY-DOSSIER_2026-09-22.md`, `docs/API-ENVELOPE-RECEIPT.md`, `docs/BENCH-i18n-gaps.md`, `docs/ci-both-states-proof_2026-09-22.md` — supporting wave artifacts

`SECURITY.md` at the repo root covers vulnerability reporting.
