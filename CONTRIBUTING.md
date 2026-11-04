# Contributing to WebCoder

WebCoder is a competitive-programming platform: a Django REST backend under
`backend/` and a Next.js frontend at the repo root, with Playwright e2e under
`e2e/`.

## The gates (all must be green)

Every push to `main` and every PR runs:

| Gate | What it enforces | Where |
|---|---|---|
| `Django CI` | backend pytest with **100% line AND branch coverage** on the measured scope | `.github/workflows/django.yml` |
| `Frontend CI (Next.js)` | eslint (zero warnings), build, vitest with coverage | `.github/workflows/frontend.yml` |
| `Verify` | both suites from one checkout (`scripts/verify`) | `.github/workflows/verify.yml` |
| `E2E Tests (Playwright)` | browser specs against the mock API | `.github/workflows/e2e.yml` |
| `quality` | lean 6-gate: ruff lint+format [py], oxlint+biome [ts/js], tsc, basedpyright (standard), coverage, opengrep SAST, gitleaks, osv-scanner — zero tolerance (`deps-severity-floor: any`) | `.github/workflows/quality.yml` |
| `CodeQL` | code scanning, push/PR/weekly | `.github/workflows/codeql.yml` |

## Run the gates locally

```bash
# Backend (test settings are self-contained: settings_ci seeds its env)
python -m pip install -r backend/deps.txt pytest pytest-cov
python -m pytest -q --cov-fail-under=100   # from the repo root; must be 100.00%

# Lint + format (the workflow's own pinned CLIs, self-contained)
ruff check . && ruff format --check .       # Python
npx oxlint@1.69.0 --deny-warnings .         # ts/js lint
npx @biomejs/biome@2.5.0 ci --formatter-enabled=true --linter-enabled=false --assist-enabled=false .

# Types
npx tsc --noEmit                            # ts/js
basedpyright                                # py (honors pyrightconfig.json)

# Frontend
npm ci
npm run lint && npm run test && npm run build
```

`bash scripts/verify` runs the backend + frontend suites from one checkout,
mirroring the CI gates.

## Coverage scope, stated honestly

Backend is measured at **100% line + branch** (enforced by `--cov-branch
--cov-fail-under=100` with `[tool.coverage.run] branch = true`), scoped to
`backend/**` first-party Django source via `pyproject.toml ->
[tool.coverage.run] source/omit`.

Deliberately **outside** the measured scope (each named in `pyproject.toml`
with its rationale):

- generated boilerplate: `migrations/`, `manage.py`, `asgi.py`, `wsgi.py`
- `settings.py` / `settings_ci.py` (exercised at import; the production
  profile is env-driven and covered by dedicated settings tests)
- the test files themselves (`test_*.py`, `tests.py`, `conftest.py`)
- vendored trees (`venv/`, `site-packages/`, `node_modules/`)

Frontend coverage is measured (not thresholded) by `npm run test:coverage`
(`vitest run --coverage`), the same command `frontend.yml` runs.

## Rules of engagement

- Never weaken a gate to make a branch green: fix the code or the config.
- Tests ship with the change that needs them.
- Never push to `main`; every change lands through a PR.
- Verify before claiming done — a local pass means what a CI pass means.
