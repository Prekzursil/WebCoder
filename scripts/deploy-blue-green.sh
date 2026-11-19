#!/usr/bin/env bash
# Item 140 (wave G section J) — blue-green deploy flip for the live stack.
#
# One color serves at a time: backend-blue (:8010) or backend-green
# (:8020), distinct compose services so both can coexist during a flip.
# The edge proxy (docker-compose.edge.yml) routes to the ACTIVE color
# via EDGE_UPSTREAM.
#
# Steps:
#   1. detect the active color (which service is running);
#   2. bring up the INACTIVE color from a fresh build;
#   3. wait for its /readyz (db+cache+broker) — it takes zero traffic
#      until every dependency answers;
#   4. run migrations on the new color;
#   5. flip EDGE_UPSTREAM + restart edge; stand the old color down.
#
# Rollback: run with --no-build — it flips straight back to the color
# that was live before.
#
# Usage (from the repo root):
#   scripts/deploy-blue-green.sh            # build + flip
#   scripts/deploy-blue-green.sh --no-build # flip with existing images
set -euo pipefail

NO_BUILD=0
[[ "${1:-}" == "--no-build" ]] && NO_BUILD=1
BASE=(-f docker-compose.yml -f docker-compose.override.yml)

port_of() { case "$1" in blue) echo 8010 ;; green) echo 8020 ;; *) echo "" ;; esac; }
service_of() { echo "backend-$1"; }

up() { docker compose "${BASE[@]}" ps --status running --format '{{.Service}}' 2>/dev/null | grep -Fx "$1" >/dev/null; }

ACTIVE="none"
for color in blue green; do
  if up "$(service_of "$color")"; then ACTIVE="$color"; break; fi
done
if [[ "$ACTIVE" == "none" ]]; then
  echo "deploy: no color running; starting blue."
fi
TARGET="green"; [[ "$ACTIVE" == "green" ]] && TARGET="blue"
TARGET_PORT="$(port_of "$TARGET")"

echo "deploy: active=${ACTIVE} target=${TARGET} (:${TARGET_PORT})"

if [[ "$NO_BUILD" -eq 0 ]]; then
  echo "== building =="
  docker compose "${BASE[@]}" build "$(service_of "$TARGET")"
fi

echo "== bringing up ${TARGET} =="
docker compose "${BASE[@]}" -f "docker-compose.${TARGET}.yml" up -d "$(service_of "$TARGET")"

echo "== waiting for /readyz on :${TARGET_PORT} =="
ok=0
for i in $(seq 1 60); do
  if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:${TARGET_PORT}/readyz"; then ok=1; break; fi
  sleep 2
done
if [[ "$ok" -ne 1 ]]; then
  echo "FAIL: ${TARGET} never became ready; ${ACTIVE} untouched, no traffic impact." >&2
  exit 1
fi

echo "== migrations on ${TARGET} =="
docker compose "${BASE[@]}" -f "docker-compose.${TARGET}.yml" exec -T "$(service_of "$TARGET")" \
  python manage.py migrate --noinput

echo "== verified: ${TARGET} healthy on :${TARGET_PORT}; flipping edge =="
if docker compose "${BASE[@]}" ps --status running --format '{{.Service}}' 2>/dev/null | grep -Fx edge >/dev/null; then
  EDGE_UPSTREAM="$(service_of "$TARGET"):8000" docker compose "${BASE[@]}" -f docker-compose.edge.yml up -d edge
fi

if [[ "$ACTIVE" == "blue" || "$ACTIVE" == "green" ]]; then
  echo "== standing down ${ACTIVE} =="
  docker compose "${BASE[@]}" -f "docker-compose.${ACTIVE}.yml" stop "$(service_of "$ACTIVE")" || true
fi

echo "deploy complete: ${TARGET} live on :${TARGET_PORT}. Rollback: scripts/deploy-blue-green.sh --no-build"
