#!/usr/bin/env bash
set -euo pipefail

cd /workspace

export HUSKY="${HUSKY:-0}"
export CI="${CI:-true}"
export CHROME_BIN="${CHROME_BIN:-/usr/bin/chromium}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://backend:3001}"
export API_UPSTREAM_URL="${API_UPSTREAM_URL:-$NEXT_PUBLIC_API_URL}"
export NEXT_PUBLIC_WS_URL="${NEXT_PUBLIC_WS_URL:-ws://backend:3001}"
export E2E_BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:3000}"
# Docker sets HOSTNAME to the container id; Next standalone binds to it, so 127.0.0.1:3000 stays closed and wait-on times out.
export HOSTNAME=0.0.0.0

pnpm install --frozen-lockfile
pnpm nx run frontend:build --skip-nx-cache

cd apps/frontend
if [[ "${E2E_UPDATE_REFS:-0}" == "1" ]]; then
  pnpm run e2e:ci:update-refs
else
  pnpm run e2e:ci
fi
