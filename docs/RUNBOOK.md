# WebCoder Runbook — local dev & live stack (2026-10-21)

Repo layout today: `main` = Next.js 15 app at repo root; `backend` branch = same tree **plus** `backend/` (Django), `docker-compose.yml`, `start_webcoder.bat`. Work the backend from a worktree of that branch (`git worktree add ../wc-backend origin/backend`).

## Mode A — full docker stack (compose; use for Lane 1 live validation)

```bash
git worktree add <path> origin/backend && cd <path>
cp backend/.env.example .env        # fill SECRET_KEY, POSTGRES_PASSWORD
docker compose up --build -d        # postgres + redis + backend(:8000) + judge-runner
docker compose exec backend python manage.py migrate
ADMIN_USER=admin ADMIN_EMAIL=a@b.c ADMIN_PASS=... docker compose exec backend python manage.py create_admin
cd <frontend clone: main branch>    # Next app runs on the host
NEXT_PUBLIC_API_BASE=http://localhost:8000 npm run dev
```

- Judge runs through the sandboxed container (`JUDGE_BACKEND=container` in compose): network-none, read-only rootfs, cap-drop ALL, uid 1000, container name `webcoder-judge-runner` (load-bearing — backend `docker exec`s into it).
- Compose postgres publishes **no host port** (local PG already owns 5433). Inspect: `docker compose exec postgres psql -U webcoder_user`.

## Mode B — hybrid (backend in venv; fastest iteration)

```bash
py -3.12 -m venv .venv && .venv/Scripts/python -m pip install -r backend/deps.txt
SECRET_KEY=... DB_PASSWORD=... .venv/Scripts/python backend/manage.py migrate      # needs local PG on 5433
.venv/Scripts/python backend/manage.py runserver                                    # :8000
celery -A webcoder_api worker -l info            # filesystem broker (see caveat 1)
JUDGE_BACKEND=local                              # judged commands run ON HOST — dev only
```

## Test batteries (all currently green; keep them that way per PR)

```bash
npm run test                                     # vitest 298 (frontend, main branch)
npx playwright test                              # e2e 8/8, mock-api mode (boots next dev :3311)
SECRET_KEY=x DB_PASSWORD=x python -m pytest      # backend 499 tests, 100% cov, sqlite settings_ci
```

## Env manifest

| Var | Used by | Notes |
|---|---|---|
| SECRET_KEY | Django | fail-loud (settings.py:35); any long random string locally |
| DB_NAME/DB_USER/DB_PASSWORD | Django | compose defaults webcoder_db/webcoder_user |
| DB_HOST/DB_PORT | Django | compose: postgres/5432; hybrid: localhost/5433 |
| JUDGE_BACKEND | judge_utils | `local` (host exec, dev-only) / `container` (sandboxed) |
| ADMIN_USER/ADMIN_EMAIL/ADMIN_PASS | create_admin | seeds superuser |
| NEXT_PUBLIC_API_BASE | frontend | default http://localhost:8000 (src/lib/api-config.ts) |
| OAuth client ids/secrets | add_social_apps mgmt command | needed only for Google/GitHub login |

## Ports

8000 Django · 3000 Next dev · 5433 local Postgres (compose PG unpublished) · 3311/8901 e2e (dev server + mock API).

## Known caveats (tracked in SPEC-GAPS)

1. Celery uses the **filesystem broker** — `celery.py` hardcodes it; redis service in compose is currently unused (G5: wire CELERY_BROKER_URL + add celery-worker service).
2. Compose has **no frontend service** (placeholder; G6).
3. Backend container mounts **docker.sock** (judge exec) — acceptable single-host dev; socket-proxy before production (G12).
4. `settings.py` DEBUG=True / ALLOWED_HOSTS=[] / CORS localhost-only — a prod profile arrives with Lane 4/5 (G8).
