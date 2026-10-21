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
| DEBUG | Django | `true` dev / `false` prod profile; parsed as 1/true/yes/on |
| ALLOWED_HOSTS | Django | comma-separated; empty default (prod: deny-all until set) |
| CORS_ALLOWED_ORIGINS | Django | comma-separated; dev default http://localhost:3000 |
| JWT_SECRET_KEY | Django (prod profile) | dedicated JWT signing key; falls back to SECRET_KEY |
| SECURE_SSL_REDIRECT | Django (prod profile) | default true in prod profile |
| OAuth client ids/secrets | add_social_apps mgmt command | needed only for Google/GitHub login |

## Production settings profile (backend branch)

`webcoder_api.settings_prod` is the env-driven production profile (SPEC-GAPS SP2 wave scope). The dev/live stack is unchanged — compose keeps `DJANGO_SETTINGS_MODULE: ${DJANGO_SETTINGS_MODULE:-webcoder_api.settings}` — a deployment flips one env var:

```bash
DJANGO_SETTINGS_MODULE=webcoder_api.settings_prod SECRET_KEY=<strong> JWT_SECRET_KEY=<strong> ALLOWED_HOSTS=api.example.com CORS_ALLOWED_ORIGINS=https://app.example.com DB_PASSWORD=... docker compose up -d backend celery-worker
```

| Setting | Env var | Dev default (`settings`) | Prod default (`settings_prod`) |
|---|---|---|---|
| DEBUG | `DEBUG` | `true` | `false` (explicit `DEBUG=true` opt-in only) |
| ALLOWED_HOSTS | `ALLOWED_HOSTS` (comma-sep) | `[]` (localhost allowed via DEBUG) | `[]` = deny-all — MUST be set |
| CORS_ALLOWED_ORIGINS | `CORS_ALLOWED_ORIGINS` (comma-sep) | `["http://localhost:3000"]` | `[]` = deny-all — MUST be set |
| JWT signing key | `JWT_SECRET_KEY` | `SECRET_KEY` | `SECRET_KEY` fallback; set a dedicated one |
| SECURE_SSL_REDIRECT | `SECURE_SSL_REDIRECT` | n/a | `true` (set `false` only behind a plain-HTTP hop) |

The prod profile also switches on HSTS (1y, subdomains, preload), `SECURE_PROXY_SSL_HEADER=('HTTP_X_FORWARDED_PROTO','https')`, secure session/CSRF cookies, `SECURE_REFERRER_POLICY='same-origin'`, `SECURE_CONTENT_TYPE_NOSNIFF`, CORS credentials, and narrows the GitHub OAuth scope to `['user','user:email']` (needs one re-consent from already-connected users).

Acceptance gate (per the SP2 design):

```bash
cd backend
DJANGO_SETTINGS_MODULE=webcoder_api.settings_prod SECRET_KEY=x DB_PASSWORD=x   python manage.py check --deploy   # must exit 0
```

## Ports

8000 Django · 3000 Next dev · 5433 local Postgres (compose PG unpublished) · 3311/8901 e2e (dev server + mock API).

## Known caveats (tracked in SPEC-GAPS)

1. Celery uses the **filesystem broker** — `celery.py` hardcodes it; redis service in compose is currently unused (G5: wire CELERY_BROKER_URL + add celery-worker service).
2. Compose has **no frontend service** (placeholder; G6).
3. Backend container mounts **docker.sock** (judge exec) — acceptable single-host dev; socket-proxy before production (G12).
4. ~~DEBUG=True / ALLOWED_HOSTS=[] / CORS localhost-only~~ **shipped** — the trio is env-driven (`DEBUG`/`ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS`) and `webcoder_api.settings_prod` is the production profile (see the section above; SP2/G8).
