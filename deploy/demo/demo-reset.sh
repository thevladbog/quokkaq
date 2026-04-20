#!/usr/bin/env bash
# Full reset: stop API, wipe Postgres public schema, start API (migrations), seed-plans + seed-demo.
# Run from the host with Docker, or from the demo-scheduler sidecar (mount repo + docker.sock).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${COMPOSE_DIR:-$SCRIPT_DIR}"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.demo.yml"
ENV_FILE="${COMPOSE_DIR}/.env.demo"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-quokkaq-demo}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE (copy from .env.demo.example)" >&2
  exit 1
fi

dc() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

echo "[demo-reset] Stopping backend (if running)..."
dc stop backend 2>/dev/null || true

echo "[demo-reset] Dropping public schema..."
dc up -d postgres >/dev/null
dc exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-quokkaq}" -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public; CREATE EXTENSION IF NOT EXISTS pgcrypto;"'

echo "[demo-reset] Starting backend (migrations)..."
dc up -d backend

echo "[demo-reset] Waiting for backend container..."
cid=""
for _ in $(seq 1 30); do
  cid="$(dc ps -q backend 2>/dev/null || true)"
  [[ -n "${cid:-}" ]] && break
  sleep 1
done
if [[ -z "${cid:-}" ]]; then
  echo "[demo-reset] backend service not found (docker compose ps -q backend empty after 30s)" >&2
  exit 1
fi

echo "[demo-reset] Waiting for backend health..."
for _ in $(seq 1 90); do
  st="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "$cid" 2>/dev/null || echo unknown)"
  if [[ "$st" == "healthy" ]]; then
    break
  fi
  sleep 2
done

st="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' "$cid" 2>/dev/null || echo unknown)"
if [[ "$st" != "healthy" ]]; then
  echo "Backend did not become healthy (last status: $st)" >&2
  exit 1
fi

echo "[demo-reset] Seeding subscription plans..."
dc exec -T backend /app/seed-plans

echo "[demo-reset] Seeding demo dataset..."
dc exec -T backend /app/seed-demo

echo "[demo-reset] Done."
