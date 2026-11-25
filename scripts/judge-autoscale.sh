#!/usr/bin/env bash
# Item 136 (wave G section J) — worker autoscaling for the docker stack.
#
# Reads the recommendation from the ops endpoint (the same decision
# function as backend/ops/autoscale.py + the admin card) and applies it
# with `docker compose up -d --scale celery-worker=N`.
#
# Usage:
#   scripts/judge-autoscale.sh --api http://127.0.0.1:8010 --token <admin JWT>
#   scripts/judge-autoscale.sh --dry-run ...   # print, do not apply
#
# Cron example (every minute during contests):
#   * * * * * /opt/webcoder/scripts/judge-autoscale.sh --api ... --token ...
set -euo pipefail

API="http://127.0.0.1:8010"
TOKEN=""
DRY_RUN=0
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.override.yml)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api) API="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$TOKEN" ]]; then
  echo "FAIL: --token <admin JWT> required (ops.autoscale is admin-only)." >&2
  exit 2
fi

CURRENT=$(docker compose "${COMPOSE_FILES[@]}" ps -q celery-worker 2>/dev/null | wc -l | tr -d ' ')
[[ "${CURRENT}" -gt 0 ]] || CURRENT=1

ADVICE=$(curl -sf "${API}/api/v1/ops/autoscale/?workers=${CURRENT}" \
  -H "Authorization: Bearer ${TOKEN}")
RECOMMENDED=$(printf '%s' "$ADVICE" | python -c 'import json,sys; print(json.load(sys.stdin)["recommended_workers"])')
DIRECTION=$(printf '%s' "$ADVICE" | python -c 'import json,sys; print(json.load(sys.stdin)["direction"])')
DEPTH=$(printf '%s' "$ADVICE" | python -c 'import json,sys; print(json.load(sys.stdin)["queue_depth"])')

echo "autoscale: current=${CURRENT} recommended=${RECOMMENDED} direction=${DIRECTION} queue_depth=${DEPTH}"

if [[ "$DIRECTION" == "hold" ]]; then
  exit 0
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry-run: would run: docker compose up -d --scale celery-worker=${RECOMMENDED}"
  exit 0
fi

docker compose "${COMPOSE_FILES[@]}" up -d --scale celery-worker="${RECOMMENDED}"
echo "autoscale: applied celery-worker=${RECOMMENDED}"
