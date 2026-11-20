#!/usr/bin/env bash
# Item 142 (wave G section J) — restore drill: prove the newest backup
# actually restores (RUNBOOK §db-backups step 4, productized).
#
# Brings up a THROWAWAY postgres on port 55432, pg_restores the newest
# dump from the pgbackups volume into it, then compares row counts of
# the core tables against the live DB. Exits non-zero on any mismatch.
#
# Usage (from the repo root, live stack running):
#   scripts/restore-drill.sh
set -euo pipefail

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.override.yml)
DRILL_DB="webcoder_drill"
DRILL_PORT="55432"

echo "== restore drill: newest dump =="
NEWEST=$(docker compose "${COMPOSE_FILES[@]}" exec -T db-backup sh -c \
  'ls -1t /backups/*.dump* /backups/*.sql* 2>/dev/null | head -1' | tr -d '\r\n')
if [[ -z "$NEWEST" ]]; then
  echo "FAIL: no dumps found in the pgbackups volume." >&2
  exit 1
fi
echo "newest dump: ${NEWEST}"

echo "== start throwaway postgres on :${DRILL_PORT} =="
docker rm -f webcoder-restore-drill >/dev/null 2>&1 || true
docker run -d --name webcoder-restore-drill \
  -e POSTGRES_DB="${DRILL_DB}" \
  -e POSTGRES_USER=drill \
  -e POSTGRES_PASSWORD=drill \
  -p "${DRILL_PORT}:5432" \
  postgres:16-alpine >/dev/null
trap 'docker rm -f webcoder-restore-drill >/dev/null 2>&1 || true' EXIT

for i in $(seq 1 30); do
  if docker exec webcoder-restore-drill pg_isready -U drill >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "== pg_restore into the scratch DB =="
# The dump lives in the db-backup container's volume; stream it out.
docker compose "${COMPOSE_FILES[@]}" exec -T db-backup sh -c "cat '${NEWEST}'" | \
  docker exec -i webcoder-restore-drill \
  pg_restore -U drill -d "${DRILL_DB}" --clean --if-exists --no-owner 2>&1 | \
  grep -v 'does not exist, skipping' || true

echo "== row-count parity (live vs drill) =="
LIVE_URI="postgresql://${LIVE_DB_USER:-webcoder_user}:${LIVE_DB_PASSWORD:-webcoder_dev_password}@127.0.0.1:5432/${LIVE_DB_NAME:-webcoder_db}"
DRILL_URI="postgresql://drill:drill@127.0.0.1:${DRILL_PORT}/${DRILL_DB}"

FAILED=0
for table in users_user problems_problem submissions_submission; do
  LIVE_N=$(docker exec "$(docker compose "${COMPOSE_FILES[@]}" ps -q postgres)" \
    psql -U "${LIVE_DB_USER:-webcoder_user}" -d "${LIVE_DB_NAME:-webcoder_db}" -tAc \
    "SELECT COUNT(*) FROM ${table}" 2>/dev/null || echo "err")
  DRILL_N=$(docker exec webcoder-restore-drill \
    psql -U drill -d "${DRILL_DB}" -tAc "SELECT COUNT(*) FROM ${table}" 2>/dev/null || echo "err")
  echo "  ${table}: live=${LIVE_N} drill=${DRILL_N}"
  if [[ "${LIVE_N}" != "${DRILL_N}" ]]; then
    echo "  MISMATCH on ${table}" >&2
    FAILED=1
  fi
done

if [[ "$FAILED" -ne 0 ]]; then
  echo "== drill FAILED — backup is NOT restorable-consistent. Investigate before the next window. ==" >&2
  exit 1
fi
echo "== drill PASSED at $(date -Iseconds) — record it in the quarterly restore log (RUNBOOK §restore-drill) =="
