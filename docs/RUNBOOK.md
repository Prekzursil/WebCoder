# WebCoder Runbook — local dev & live stack (single-branch edition, 2026-10-27)

Repo layout (since the 2026-10-27 unification): **`main` is the only branch** — a monorepo with the Next.js 15 app at the repo root (`src/`, `package.json`) **plus** `backend/` (Django), `docker-compose.yml` (+ hardening overlays), `backend/Dockerfile`, `backend/Dockerfile.judge`. The old `backend` branch was merged in with a true merge commit (history preserved) and retired under the tag `archive/backend-branch-2026-10-26`. Every PR targets `main` and must keep BOTH suites green (frontend vitest/build/lint/playwright + backend pytest).

## Mode A — full docker stack (compose; use for Lane 1 live validation)

```bash
git clone -b main <repo> <path> && cd <path>       # or: git worktree add <path> origin/main
cp backend/.env.example .env        # fill SECRET_KEY, POSTGRES_PASSWORD
docker compose up --build -d        # postgres + redis + backend(:8000) + judge-runner + celery-worker + beat + socket-proxy + db-backup
docker compose exec backend python manage.py migrate
ADMIN_USER=admin ADMIN_EMAIL=a@b.c ADMIN_PASS=... docker compose exec backend python manage.py create_admin
NEXT_PUBLIC_API_BASE=http://localhost:8000 npm run dev   # Next app runs on the host (compose has no frontend service)
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

## Real-backend e2e mode (QA wave 5, [Q13])

The Playwright suite defaults to the hermetic mock API (CI never needs a
backend). To run the SAME specs against the live compose stack:

```bash
# 1. The stack must allow the dev-server origin (CORS) — wt-live override:
#    services.backend.environment.CORS_ALLOWED_ORIGINS with http://localhost:3311
#    (settings.py reads CORS_ALLOWED_ORIGINS; restart backend after changing).
# 2. Run with the toggle:
E2E_API_BASE=http://127.0.0.1:8010 npx playwright test
```

- The mock API server is NOT started; `NEXT_PUBLIC_API_BASE` points at the
  live stack for both server-side and browser fetches (no route mocks).
- The seeded fixtures (`e2e/lib/realStack.ts`) self-heal: Two Sum / Reverse
  String are created once per run and deleted by the global teardown.
- `E2E_ADMIN_USER` / `E2E_ADMIN_PASS` (defaults: admin / the compose admin
  password) seed fixtures; `bob / BobPass-2026!x` is the non-admin probe user.
- The catalog's 60s ISR fetch cache is disabled while `E2E_API_BASE` is set
  (`src/app/problems/_lib/problems-api.ts`) so seeding is immediately visible.

## Test batteries — single-branch, ALL from the repo root (keep green per PR)

```bash
npm run test                                     # vitest (frontend, root)
npx tsc -p tsconfig.json --noEmit                # typecheck
npm run lint                                     # eslint — 0 errors AND 0 warnings (zero-warnings policy)
npm run build                                    # next build
npx playwright test                              # e2e, mock-api mode (boots next dev :3311)
SECRET_KEY=x DB_PASSWORD=x python -m pytest      # backend suite, sqlite settings_ci, 100% cov, zero warnings
```

Backend gate from a Windows shell (the proven chain — any python with
`backend/deps.txt` installed works; `.venv` in a scratch worktree is fine):

```
SECRET_KEY=x DB_PASSWORD=x <python.exe> -m pytest -q
```

## PR conventions (single-branch)

- **Everything targets `main`** — there is no other base branch. Never reopen the old split.
- Both suites green before merge: frontend (`npm run test`, `tsc --noEmit`, `npm run lint` zero-warnings, `npm run build`, `npx playwright test` in mock mode) AND backend (`pytest` 100% line coverage, warning-clean). CI mirrors this: `frontend.yml` runs on root-source paths, `django.yml` on `backend/**` paths, CodeQL on everything.
- Default merge is **squash** (`gh pr merge --squash --delete-branch`); a true (non-squash) merge commit is reserved for history-preserving operations such as the 2026-10-27 unification merge.
- Live-stack validation after backend merges: `git -C <live worktree> pull --ff-only origin main`, then `docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build backend celery-worker judge-runner` + `docker compose exec backend python manage.py migrate`.

## Env manifest

| Var | Used by | Notes |
|---|---|---|
| SECRET_KEY | Django | fail-loud (settings.py:35); any long random string locally |
| DB_NAME/DB_USER/DB_PASSWORD | Django | compose defaults webcoder_db/webcoder_user |
| DB_HOST/DB_PORT | Django | compose: postgres/5432; hybrid: localhost/5433 |
| JUDGE_BACKEND | judge_utils | `local` (host exec, dev-only) / `container` (sandboxed) |
| JUDGE_SANDBOX_VOLUME | judge_utils/custom_libs | compose sets webcoder_judge-sandbox; unset ⇒ custom-libs pip fails closed |
| JUDGE_PIP_NETWORK / JUDGE_PYPI_INDEX_URL | judge_utils/custom_libs | pip-install container network/index; default `none`/unset ⇒ fail closed (see §judge-pip-egress) |
| REDIS_URL | Django CACHES | compose: redis://redis:6379/1 (shared throttle counters); unset ⇒ LocMem |
| THROTTLE_ANON_RATE / THROTTLE_USER_RATE / THROTTLE_AUTH_RATE / THROTTLE_SUBMIT_RATE | DRF throttles (SP4) | defaults 60/min · 240/min · 10/min · 20/hour |
| JWT_AUTH_SAMESITE / JWT_AUTH_SECURE | dj-rest-auth cookies (SP1) | dev `Lax`/`false`; cross-site deploys: `None` + `true` |
| ADMIN_USER/ADMIN_EMAIL/ADMIN_PASS | create_admin | seeds superuser |
| NEXT_PUBLIC_API_BASE | frontend | default http://localhost:8000 (src/lib/api-config.ts) |
| DEBUG | Django | `true` dev / `false` prod profile; parsed as 1/true/yes/on |
| ALLOWED_HOSTS | Django | comma-separated; empty default (prod: deny-all until set) |
| CORS_ALLOWED_ORIGINS | Django | comma-separated; dev default http://localhost:3000; cookies need the exact frontend origin + credentials (CORS_ALLOW_CREDENTIALS=True) |
| JWT_SECRET_KEY | Django (prod profile) | dedicated JWT signing key; falls back to SECRET_KEY |
| SECURE_SSL_REDIRECT | Django (prod profile) | default true in prod profile |
| OAuth client ids/secrets | add_social_apps mgmt command | needed only for Google/GitHub login |

## Production settings profile (backend/)

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

## Rate limiting (SP4) & JWT cookie auth (SP1) — deployed behavior

- DRF throttles are ON in compose: baseline `anon 60/min` + `user 240/min` on every endpoint, scoped `auth 10/min` on `/users/register/` and the dj-rest-auth login/register views, `submit 20/hour` on `POST /submissions/submit/` (the judge-DoS chokepoint). Counters live in redis (`REDIS_URL`), shared across processes. Exceeding a limit returns `429` with `Retry-After`.
- Auth is now httpOnly-cookie based: login/refresh set `wc_access`/`wc_refresh` cookies (SameSite=Lax dev default; the login body no longer carries the refresh token). Cookie-authenticated unsafe methods require `X-CSRFToken` (double-submit; obtain the `csrftoken` cookie via `GET /api/v1/auth/csrf/`). Refresh: `POST /api/v1/auth/token/refresh/` with an EMPTY body (dj-rest-auth reads the `wc_refresh` cookie; the token rotates and the old one is blacklisted). The simplejwt `/api/v1/token/…` endpoints remain for non-browser clients during migration.

## §socket-proxy — replacing the raw docker.sock mount (SP3/G12)

The default compose mounts the raw Docker socket into backend + celery-worker (root-equivalent host access, SECURITY-AUDIT-judge J5). The hardened variant routes the judge's docker calls through [tecnativa/docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy), granting ONLY the exec API:

```bash
docker compose -f docker-compose.yml -f docker-compose.socket-proxy.yml up -d --build
```

`docker-compose.socket-proxy.yml` removes both raw `/var/run/docker.sock` mounts, points `DOCKER_HOST=tcp://socket-proxy:2375`, and grants `CONTAINERS=1 EXEC=1 POST=1 PING=1 VERSION=1` (the exact surface `docker exec` needs) — images/build/volumes/networks/swarm/daemon-config stay denied (403).

Acceptance smoke (run once after switching):
```bash
docker compose exec backend docker -H tcp://socket-proxy:2375 ps                # lists webcoder-judge-runner
docker compose exec backend docker -H tcp://socket-proxy:2375 exec webcoder-judge-runner id   # uid=1000 — the judge path works
docker compose exec backend docker -H tcp://socket-proxy:2375 run --rm hello-world   # 403 — container-create not granted
docker compose exec backend docker -H tcp://socket-proxy:2375 info               # 403 — daemon API not granted
```
Note: under this variant the custom-libs pip install (one-shot `docker run`) fails closed — do not combine with the custom-libs overlay unless you consciously widen the proxy grants (IMAGES=1 + container-create).

## §judge-pip-egress — enabling python3 custom libraries (J3/E1)

Default posture (both backends): judged runs are ALWAYS `--network none` with a read-only submission mount — E1 closed. The pip install for `custom_libraries_allowed` runs in a separate one-shot container with `JUDGE_PIP_NETWORK=none` ⇒ fails closed with a user-facing "no network egress" message. Requirement entries must match `name` or `name==version` (strict allowlist; `git+https://…`, URLs, paths, extras → 400 at submit time).

To enable installs, provision an internal network whose only egress member is a PyPI allowlist proxy:

```bash
mkdir -p pypi-packages   # drop APPROVED wheels here (offline allowlist — no implicit internet mirror)
docker compose -f docker-compose.yml -f docker-compose.custom-libs.yml up -d --build backend celery-worker pypi-proxy
```

The overlay creates `judge-build` (`internal: true`) + a pinned pypiserver serving `./pypi-packages`, and sets `JUDGE_PIP_NETWORK=webcoder_judge-build` + `JUDGE_PYPI_INDEX_URL=http://pypi-proxy:8080/simple/` on backend/celery-worker. Only wheels you seeded are installable; the judged runs themselves still have no network.

Egress check: from the pip container only `pypi-proxy` resolves; judged runs: `docker exec webcoder-judge-runner python -c "import urllib.request,sys; urllib.request.urlopen('http://pypi.org')" 2>&1 | head -1` → network-unreachable error.

## §db-backups — postgres backup strategy (SP6/G-none)

State at risk: the `pgdata` named volume (users, problems, testcases, submissions). Submission VERDICTS are re-derivable by re-judging, but users/problems/testcases are not — treat the volume as the primary asset.

1. **Daily local dumps** — sidecar service running scheduled `pg_dump -Fc` with retention (add to an override file for any long-lived host):

   ```yaml
   # docker-compose.backups.yml
   services:
     db-backup:
       image: prodrigestivill/postgres-backup-local:16-alpine
       environment:
         POSTGRES_HOST: postgres
         POSTGRES_USER: ${POSTGRES_USER:-webcoder_user}
         POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
         POSTGRES_DB: ${POSTGRES_DB:-webcoder_db}
         PGDUMP_EXTRA_OPTS: "-Fc"
         SCHEDULE: "@daily"
         BACKUP_KEEP_DAYS: 7
         BACKUP_KEEP_WEEKS: 4
         BACKUP_KEEP_MONTHS: 6
       volumes:
         - pgbackups:/backups
       depends_on: [postgres]
       restart: unless-stopped
   volumes:
     pgbackups:
   ```
2. **Off-host copy** — cron on the host pushing `/backups` to object storage (rclone/aws s3 sync) with separate credentials; env-unset ⇒ step skipped with a WARNING (dev). Keep at least 7 daily / 4 weekly off-host.
3. **PITR** (pgBackRest / wal-g) recorded as a DECISION for later — not a blocker at this scale; re-judging covers submission churn.
4. **Restore + verify** (quarterly restore-test into a scratch DB):

   ```bash
   docker compose exec -T postgres pg_restore -U webcoder_user --clean --if-exists -d webcoder_db < <dump file from pgbackups>
   curl -s http://127.0.0.1:8010/api/v1/users/admin/stats/ -H "Authorization: Bearer <admin token>"   # row counts must match pre-restore
   ```
   Acceptance: a dump from the dev data round-trips into a fresh postgres container with matching `/users/admin/stats/` counts.

## Observability (probes, metrics, logs)

- `GET /healthz` — liveness only (touches nothing; safe when the DB is down).
- `GET /readyz` — readiness: pings database, cache, broker (redis broker only;
  the filesystem dev broker reports `skipped`). 503 with per-component detail.
- `GET /api/v1/admin/metrics/` — admin-only JSON snapshot: user/problem counts,
  submission verdict distribution, judge queue depth (PENDING/COMPILING/RUNNING),
  24h judge-duration stats.
- Compose wires the backend container healthcheck to `/healthz`.
- Logs: `LOG_JSON=1` (set in compose) emits one JSON object per line via
  `webcoder_api.jsonlog.JsonFormatter` — `docker compose logs backend` is
  machine-parseable.
- Maintenance (celery-beat, from `settings.CELERY_BEAT_SCHEDULE`): 03:00
  leaderboard full recompute, 04:00 notification purge (90d), 05:00 per-test
  output retention (blank `actual_output`/`error_output` older than 90d;
  verdicts/times always kept). Each task is safe to run manually via
  `docker compose exec celery-beat celery -A webcoder_api call <task>`.

## Backups (running by default)

- The default compose stack includes a `db-backup` service
  (prodrigestivill/postgres-backup-local:16): daily `pg_dump -Fc` into the
  `pgbackups` volume with 7-day / 4-week / 6-month retention. Off-host copy
  remains an operator decision (object storage credentials are NOT configured
  locally).
- Trigger a backup immediately (without waiting for the schedule):
  `docker compose exec db-backup sh -c 'PGPASSWORD=$POSTGRES_PASSWORD pg_dump -h $POSTGRES_HOST -U $POSTGRES_USER -Fc $POSTGRES_DB /backups/manual.dump'`
- List artifacts: `docker compose exec db-backup ls -lh /backups`
- Restore + verify:
  `docker compose exec -T postgres pg_restore -U webcoder_user --clean --if-exists -d webcoder_db < <dump file>`
  then verify via `GET /api/v1/users/admin/stats/` row counts (SP6 procedure).

## Socket-proxy (the default docker access path)

- The backend and celery-worker no longer mount `/var/run/docker.sock`; they
  reach the daemon through the `socket-proxy` service
  (`DOCKER_HOST=tcp://socket-proxy:2375`) which grants ONLY
  containers/exec POST + ping/version — the judge's `docker exec` path.
  Everything else (image pull, container create, volumes, daemon config)
  answers 403 from the proxy.
- Acceptance smoke (run from the compose root):
  - `docker compose exec backend docker ps` → lists webcoder-judge-runner
  - `docker compose exec backend docker run --rm hello-world` → 403
  - judged submission still returns AC (load smoke `--judge`, below)
- Escape hatch: `docker-compose.raw-socket.yml` restores the raw socket
  (needed only for the custom-libs pip flow) at the documented root-equivalent
  risk.

## Load / uptime story (local stack)

- `python scripts/load_smoke.py --base http://127.0.0.1:8010 --users 10
  --requests 30` — concurrent catalog + probe reads; prints p50/p95/max,
  throughput, error count (non-zero exit on errors). Add `--judge` for one
  real submit→verdict round-trip through the whole pipeline.
- Uptime: the compose healthcheck (backend `/healthz`, 30s) plus container
  `restart: unless-stopped` give self-healing; external uptime monitoring is
  out of scope for the local stack (production is not deployed).

## Known caveats (tracked in SPEC-GAPS)

1. ~~Celery filesystem broker / no worker service~~ **shipped** — compose wires `CELERY_BROKER_URL=redis://redis:6379/0` and runs `celery-worker` (G5 closed).
2. Compose has **no frontend service** (placeholder; G6) — the Next app runs on the host or Vercel (DEPLOY.md).
3. ~~Backend container mounts docker.sock~~ **shipped** — the default compose reaches the daemon through the `socket-proxy` service (`DOCKER_HOST=tcp://socket-proxy:2375`, containers/exec POST only; see §socket-proxy; SP3/G12). `docker-compose.raw-socket.yml` is the documented escape hatch for the custom-libs pip flow.
4. ~~DEBUG=True / ALLOWED_HOSTS=[] / CORS localhost-only~~ **shipped** — the trio is env-driven (`DEBUG`/`ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS`) and `webcoder_api.settings_prod` is the production profile (see the section above; SP2/G8).

## Wave C operator notes

- `manage.py seed_mcq` — seeds/refreshes the EDU-8 pilot (30 bilingual grade-9
  grile in chapter `g9-elementary-algorithms`). Idempotent; run once per deploy
  alongside `seed_problems`.
- `MEDIA_ROOT` (default `backend/media`) stores EDU-7 file deliverables; back
  it up with the database.
- Microsoft school SSO (OPS-3): set the Azure AD app's redirect to
  `<origin>/login/microsoft/callback` and configure the SocialApp (client id +
  secret) via admin/env (`add_social_apps` honors `MICROSOFT_CLIENT_ID` /
  `MICROSOFT_SECRET`); `MICROSOFT_LOGIN_CALLBACK_URL` overrides the SPA
  callback the backend hands to allauth (default localhost:3000).
- Public API (OPS-1): `/api/v1/public/` is unauthenticated read-only at
  `THROTTLE_PUBLIC_API_RATE` (default 60/min).

## §email — mail transport, weekly digest, deliverability (SP5/UXP-5b/OPR-5)

Mail is env-driven with a **console-backend default** — no deploy sends
real email unless `EMAIL_HOST` is set:

| Variable | Default | Purpose |
|---|---|---|
| `EMAIL_BACKEND` | `django.core.mail.backends.console.EmailBackend` | switch to `...smtp.EmailBackend` for real mail |
| `EMAIL_HOST` / `EMAIL_PORT` | `""` / `587` | the relay; empty host ⇒ the weekly digest task no-ops |
| `EMAIL_USE_TLS` | `true` | |
| `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | `""` | relay credentials |
| `DEFAULT_FROM_EMAIL` | `webcoder@localhost` | set to the verified sender |

The **weekly digest** (`notifications.tasks.weekly_digest_task`, beat
`weekly-digest`, Mondays 07:30) emails every user who submitted in the
last 7 days their attempted-but-unsolved problems plus each problem's
first hint. It self-guards: with no `EMAIL_HOST` it logs and exits 0.

**Deliverability groundwork (OPR-5) before pointing EMAIL_HOST at a
provider:** publish SPF (`v=spf1 include:<provider> ~all`), DKIM
(provider key, DNS TXT `_domainkey.*`), and `DMARC`
(`v=DMARC1; p=none; rua=mailto:...` monitoring first) on the sending
domain, and warm the address gradually — password-reset mail landing in
spam locks out classrooms. Allauth email verification rides the same
transport.

## §contest-replay — the OPR-4 capacity gate before the first rated contest

Round-2 requires a numeric gate before the first rated contest:
**50 concurrent submitters, p95 judge wait < 20 s, zero errors.**

```
python scripts/contest_replay.py --base http://127.0.0.1:8010 \
    --contest <id> --users 50 --per-user 2 \
    --admin-username admin --admin-password '...'
```

The harness registers throwaway `replay_*` users, registers them for the
open contest, submits trivial python3 solutions through the real
judge-contest lane, and reports p50/p95/max judge wait + a PASS/FAIL
verdict (exit 0/1). Rehearse at `--users 10` first; the note reminds you
the full gate needs 50. Clean the `replay_*` users afterwards (admin
users view or SQL) — they exist only as load probes.
