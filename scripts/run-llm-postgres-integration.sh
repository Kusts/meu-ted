#!/usr/bin/env bash
# LLM Postgres integration suites against a disposable postgres:16 container.
# Spins the container on a random host port, creates the test databases,
# exports the DATABASE_URL_TEST_* vars + DB_TEST_MARKER the suites read,
# runs the 4 LLM integration files, then always removes the container.
# Usage: bash scripts/run-llm-postgres-integration.sh
set -euo pipefail

CONTAINER="llm-it-pg-$$"
USER="synkroo"
PASSWORD="change-me-local-dev-password"
# One database per suite: the files TRUNCATE shared tables and the V042 file
# needs a pre-V042 base, so sharing a single DB makes them interfere.
MAIN_DB="llm_it_main"
FIX_DB="llm_it_fix"
LEGACY_DB="llm_it_fix_legacy"
ATOMIC_DB="llm_it_atomic"
V042_DB="llm_it_v042"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "=== [1/4] Start disposable postgres:16 ($CONTAINER, random host port) ==="
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --rm --name "$CONTAINER" \
  -e "POSTGRES_USER=$USER" -e "POSTGRES_PASSWORD=$PASSWORD" -e "POSTGRES_DB=$USER" \
  -P postgres:16-alpine >/dev/null

echo "Waiting for Postgres..."
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U "$USER" -d "$USER" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker exec "$CONTAINER" pg_isready -U "$USER" -d "$USER" >/dev/null

PORT="$(docker port "$CONTAINER" 5432 | head -n 1 | rev | cut -d: -f1 | rev)"
echo "Postgres ready on 127.0.0.1:$PORT."

echo "=== [2/4] Create one test database per suite ==="
for DB in "$MAIN_DB" "$FIX_DB" "$LEGACY_DB" "$ATOMIC_DB" "$V042_DB"; do
  docker exec "$CONTAINER" psql -U "$USER" -d "$USER" -c "CREATE DATABASE $DB;" >/dev/null
done

BASE_URL="postgresql://$USER:$PASSWORD@127.0.0.1:$PORT"
export DATABASE_URL_TEST="$BASE_URL/$MAIN_DB"
export DATABASE_URL_TEST_FIX="$BASE_URL/$FIX_DB"
export DATABASE_URL_TEST_FIX_LEGACY="$BASE_URL/$LEGACY_DB"
export DATABASE_URL_TEST_ATOMIC="$BASE_URL/$ATOMIC_DB"
export DATABASE_URL_TEST_V042="$BASE_URL/$V042_DB"
export DB_TEST_MARKER="llm-integration"

echo "=== [3/4] Run the 4 LLM integration suites ==="
pnpm --filter pi-finance-api exec vitest run --hookTimeout=180000 \
  tests/integration/postgres-llm-fix.test.ts \
  tests/integration/postgres-llm-atomic-guards.test.ts \
  tests/integration/postgres-llm-v042-alignment.test.ts \
  tests/integration/postgres-agent-llm-config.test.ts
echo "=== [4/4] Done — container removed by trap ==="
