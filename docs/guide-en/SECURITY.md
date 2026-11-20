# WebCoder — Security Guide

> One-paragraph summary: WebCoder's security posture rests on five pillars — an isolated judge sandbox reached only through a filtering Docker socket proxy, httpOnly-cookie authentication with rotation and CSRF, layered rate limits on every write path, a moderation/reporting system with audit trails, and honest operational security (backups, restore drills, published throttles, sandbox receipts). This guide documents each control, where it lives in code, and how to verify it.

**Who it's for:** operators, security reviewers, teachers/parents asking "how is my student's code run?". Romanian twin: [`docs/guide-ro/SECURITATE.md`](../guide-ro/SECURITATE.md).

---

## 1. The judge sandbox (untrusted code)

Every judged execution runs inside the `judge-runner` container with:

- `--network none` — no network during compilation or execution (verified in CI);
- read-only submission mount (writable only through the orchestrated `/srv/judge` path);
- all Linux capabilities dropped, `no-new-privileges`, uid 1000, memory/CPU/PID caps;
- per-test wall+CPU time and max-RSS limits, persisted as receipts on every result row.

The worker reaches the daemon through **socket-proxy** (tecnativa/docker-socket-proxy) granting only containers/exec POST (+ping/version): `docker run hello-world` from the backend answers 403; `docker exec webcoder-judge-runner id` succeeds. Acceptance smoke in RUNBOOK §socket-proxy.

**Custom libraries** (python3 `custom_libraries_allowed`): pip install runs in a one-shot container on an internal network whose sole egress is a pre-seeded pypi allowlist proxy; requirement lines must match `name` / `name==version` (git+/URLs/paths → 400 at submit). Default posture fails closed.

**Sandbox receipts** — `/sandbox-receipts` (user-facing): every scratch/stress run's limits and outcomes, auditable.

## 2. Authentication & sessions

- JWT access (5 min) + refresh (24 h) live in **httpOnly cookies** (`wc_access`, `wc_refresh`, SameSite=Lax dev / None+Secure cross-site); rotation blacklists the previous refresh; logout blacklists; nothing token-shaped touches `localStorage`.
- Unsafe methods require the double-submit CSRF header (`GET /api/v1/auth/csrf/` issues the cookie).
- Registration cannot self-assign roles (the B1 kill); role changes are admin-only.
- 2FA (TOTP) for privileged roles — progressive enforcement via `TWO_FACTOR_ENFORCE`.
- Personal API tokens for the read-only public API (revocable; higher throttle tier).
- Password reset by single-use, email-aware tokens; OAuth providers scoped minimally (GitHub `user,user:email` in prod profile).

## 3. Rate limiting (abuse & DoS surface)

Redis-backed, shared across processes (`THROTTLE_*` envs):

| Scope | Default |
|---|---|
| anonymous baseline | 60/min |
| authenticated baseline | 240/min |
| auth (login/register) | 10/min |
| submission create | 20/hour |
| scratch / guest try-it / sample-run | own scoped caps (guest 5/h per IP) |
| public API | 60/min (240/min with token) |
| translation proposals | 10/h |

## 4. Content & community safety

- Report buttons on posts, messages, problems; moderator queue with SLA tracking and audit trail; appeals process.
- Messaging: per-message reporting, RO+EN flag-not-block content filter, end-to-end blocks, send caps (30/h, 10 threads/h), minor-contact policy, report-gated transcripts.
- Spoiler enforcement server-side inside problem-scoped threads; hide-at-threshold with reveal; trust-weighted voting.
- Minors (GDPR Art. 8, Romania 16+): non-public profiles by default, county/school hidden, parental-consent recording, school-mediated enrollment.

## 5. Data protection

- GDPR: data export endpoint, soft-delete + scheduled purge, cookie notice, `/terms` + `/privacy` pages, DPA template for schools (`docs/DPA-TEMPLATE.md`).
- Per-test outputs: hidden-test actual/expected outputs are stripped for non-privileged viewers; sample data is public by design; retention task blanks stale outputs after 90 days (verdicts/times always kept).
- Backups: daily `pg_dump -Fc` sidecar with 7d/4w/6m retention; off-host copy is an operator decision; restore + verify procedure with row-count acceptance.

## 6. Operational security

- Secrets: compose fails loud (`${SECRET_KEY?err}`); prod profile (`webcoder_api.settings_prod`) is deny-all until `ALLOWED_HOSTS`/`CORS_ALLOWED_ORIGINS` are set; HSTS, secure cookies, SSL redirect, referrer policy, nosniff on.
- Dependency posture: Dependabot + CodeQL + OSV scanner configs in-repo.
- Observability: `/healthz` (liveness) + `/readyz` (db/cache/broker), JSON logs, admin metrics.
- Incident contact: `/security` documents reporting; the bug-bounty page formalizes scope.

## 7. How to verify the claims

```bash
# sandbox network isolation
docker exec webcoder-judge-runner python -c "import urllib.request;urllib.request.urlopen('http://p.org')"   # must fail

# socket-proxy denies container-create
docker compose exec backend docker -H tcp://socket-proxy:2375 run --rm hello-world   # 403

# judged submission still AC (load smoke with a real round-trip)
python scripts/load_smoke.py --base http://127.0.0.1:8010 --judge

# restore drill
scripts/restore-drill.sh
```

Full architecture context: [`ARCHITECTURE.md`](ARCHITECTURE.md). Operational runbook: `docs/RUNBOOK.md`.
