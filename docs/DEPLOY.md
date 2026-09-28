# WebCoder Deployment — 2026-09-28

The product is merged to `main` (merge commit `165459fb`, CRA removal `7189d57d`).
Two supported paths; pick ONE. Neither is executed yet — this is the runbook.

## Path A — Vercel (frontend) + any Django host
1. `cd frontend/web && vercel login` (owner action — agents never create accounts/tokens)
2. `vercel link` → set project env `NEXT_PUBLIC_API_BASE=https://<your-django-origin>`
3. `vercel deploy --prod` → URL
Backend must be publicly reachable with CORS for the Vercel origin
(`settings.py` `CORS_ALLOWED_ORIGINS` currently allows `http://localhost:3000` only — add the Vercel origin).

## Path B — Self-host via docker compose (repo-root `docker-compose.yml`, syntax-validated)
```
cp backend/.env.example backend/.env   # fill SECRET_KEY, DB_PASSWORD (+ optionally JUDGE_BACKEND=container)
docker compose up -d                   # postgres + redis + backend + judge-runner
cd frontend/web && NEXT_PUBLIC_API_BASE=http://<host>:8000 npm run build && npm start
```
Notes:
- `JUDGE_BACKEND=container` routes judged code through the sandboxed judge-runner
  image (non-root, cap-drop ALL, no-new-privileges, mem caps, `--network none`).
  Default `local` runs judged commands on the host — dev only.
- Frontend needs a Node runtime (dynamic server-rendered routes — static export NOT possible).

## Security gates before public exposure (from docs/SECURITY-AUDIT-judge.md)
1. E1 CRITICAL: python3+custom-lib problems get FULL bridge networking — restrict before any
   untrusted submitter touches the instance.
2. E7: verdict-forge triggers (`tle_trigger`/`mle_trigger` in inputs, `re_trigger` in source) — strip.
3. JWT in localStorage → httpOnly-cookie migration is the recommended follow-up hardening.
