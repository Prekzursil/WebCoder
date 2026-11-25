# WebCoder — Administrator Guide

> One-paragraph summary: Administrators run the content engine (curation queues, approvals, rejudging, imports) and the safety engine (moderation, reports with SLAs, appeals, integrity scans) plus platform operations (status, backups, throttles, the optional AI curator). This guide covers every admin surface and the management commands behind them.

**Who it's for:** platform ADMINs and VERIFIERs. Romanian twin: [`docs/guide-ro/GHID-ADMIN.md`](../guide-ro/GHID-ADMIN.md).

---

## 1. The admin dashboard

`/admin/dashboard` — counts, plus the operational tabs: submissions browser (verdict filter, **Rejudge** button), stuck-submission monitor (PENDING/COMPILING/RUNNING older than N minutes), user management (role changes — the only place roles move), and metrics snapshot (`/api/v1/admin/metrics/`: queue depth, verdict distribution, 24 h judge-duration stats).

## 2. Content curation

### Approval queue

`/admin/problem-queue` lists `status=PENDING` problems with the full context an evaluation needs:

- statement render + lint report + readability score + translation-gaps panel;
- **Tests row** — every test's input/expected pair, sample flag, points, subtask, per-test bar, catch rate;
- **testcase strength** (`/problems/{id}/test-strength/`) — per-test catch rate over known-wrong solutions, suite strength (samples excluded), uncalibrated flag;
- approve/reject with feedback (notifies the author; rejections keep the problem editable).

### Rejudge & integrity

- **Rejudge** (admin platform-wide; VERIFIERs on their own problems): resets to PENDING and re-dispatches through the real judge lane; per-test outcomes from the first execution are persisted so quick score swaps are possible.
- **Plagiarism/boilerplate scans** — advisory badges for human review, never auto-punish; diff view side-by-side; multi-account IP heuristics feed the same queue.
- **AI-solution labeling** — post-contest AI-declaration review + solve-pattern anomalies (see the integrity wave's queue).

### Imports & catalog ops

Management commands (run in the backend container):

```bash
python manage.py seed_problems            # starter pack + curriculum + tags
python manage.py boost_hidden_tests       # regenerate hidden suites from committed specs
python manage.py catalog_polish           # translation/hygiene payload (idempotent)
python manage.py catalog_cleanup [--apply]  # e2e/ad-hoc fixture leftovers
python manage.py export_catalog           # deterministic fixture snapshot
python manage.py import_catalog           # rebuild (or --from-release <tag>)
python manage.py calibrate_difficulty     # difficulty from AC rates (CNT-3)
```

Import provenance: the CNT-2 `ImportSource` ledger (source, contact, terms, evidence URL) must have a row before a corpus import is legitimate.

## 3. Moderation

- **Report queue**: every report button (posts, messages, problems, submissions) lands here with SLA tracking; actions: resolve/dismiss with note.
- **Appeals**: moderation decisions are appealable; the audit trail records handler, action and note.
- **Abuse contact + bounty page**: `/security` documents the reporting flow; the bug-bounty page formalizes it.
- **Content filter** (messaging): RO+EN flag-not-block filter — flagged messages queue for review rather than being silently dropped.
- Hide-at-threshold + trust-weighted voting run automatically (small negatives render 0; auto-hide with reveal toggle).

## 4. The AI curator (optional, OFF by default)

Screens community translation proposals (`/api/v1/translations/proposals/`). Configure via env (`AI_CURATOR_URL` = any OpenAI-compatible endpoint; `AI_CURATOR_MODEL`; `AI_CURATOR_TIMEOUT_S` ≤ 30; `AI_CURATOR_AUTO_APPROVE=false` default). Policy: high-confidence passes queue for human confirmation; low confidence flags; timeouts/errors mark `ai_verdict=error` and fall through to the human queue — fail-open, humans confirm every approval unless auto-approve is explicitly on. Any OpenAI-compatible server works (OpenAI, Azure, vLLM, Ollama…). See RUNBOOK §ai-curator.

## 5. Platform operations

- **Status page** (`/status`): live queue depth, judge health; the ops wave added queue transparency, autoscale scripts (`scripts/judge-autoscale.sh`) and the load-test harness (`scripts/load_smoke.py --judge`, `e2e/loadtest/replay.mjs`).
- **Backups run by default** (db-backup sidecar; RUNBOOK §Backups): trigger manually, list artifacts, restore + verify via `/api/v1/users/admin/stats/` row counts; quarterly restore drill script (`scripts/restore-drill.sh`).
- **Throttles** are env-tunable (`THROTTLE_*`); redis-backed.
- **Blue-green deploy** scripts + the contest capacity gate (`manage.py contest_replay --contest <id> --users 50`) precede any first rated contest.
- **Email**: console backend by default; set `EMAIL_HOST` + SPF/DKIM/DMARC before real sends (RUNBOOK §email).

## 6. User administration

- Roles: BASIC / CREATOR / TEACHER / VERIFIER / ADMIN — change only via the admin user view (registration can never self-assign roles).
- 2FA: progressive enforcement for privileged roles (`TWO_FACTOR_ENFORCE` flips from warn to require).
- GDPR: data export (`POST /users/me/export/`), soft-delete + purge; minors' profiles non-public; parental consent dates.
- Certificates: `manage.py issue_certificates` (idempotent derivation; `--notify` optional); revocation ledger for integrity cases.

## 7. Incident recipes

| Symptom | First moves |
|---|---|
| Submissions stuck PENDING | stuck monitor → worker logs (`docker compose logs celery-worker`) → rejudge after fix |
| Verdict suspected wrong | rejudge the submission; compare per-test rows; check `problems/{id}/test-strength/` |
| Catalog pollution after e2e runs | `catalog_cleanup --apply --allow-submissions` (probe-account guarded) |
| Beat not scheduling | `docker compose logs celery-beat` — flags changed to `--schedule` (celery 5.x) |
| Backend wedged | `/healthz` vs `/readyz` tells liveness from dependency; restart unless-stopped self-heals |
