#!/usr/bin/env bash
# PWA E2E CI runner
# Spawns fixture API + Next.js + SW harness, runs E2E, cleans up.
# Usage: bash apps/pwa/e2e/run-ci.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PWA="$ROOT/apps/pwa"
RESULT=0

cleanup() {
  echo "[run-ci] cleaning up..."
  kill "$FIXTURE_PID" 2>/dev/null || true
  kill "$NEXT_PID" 2>/dev/null || true
  kill "$SW_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  exit "$RESULT"
}
trap cleanup EXIT INT TERM

# ── Start fixture API ───────────────────────────────────────────────────────
echo "[run-ci] starting fixture API on :4010..."
pushd "$PWA" >/dev/null
pnpm exec tsx e2e/fixture-api/server.ts &
FIXTURE_PID=$!
popd >/dev/null

# Wait for fixture health
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:4010/__e2e/health >/dev/null 2>&1; then
    echo "[run-ci] fixture API ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[run-ci] ERROR: fixture API did not start"
    RESULT=1; exit 1
  fi
  sleep 1
done

# ── Build and start Next.js ─────────────────────────────────────────────────
echo "[run-ci] building Next.js..."
pushd "$PWA" >/dev/null
pnpm build:next:cloudflare
popd >/dev/null

echo "[run-ci] starting Next.js on :3001..."
pushd "$PWA" >/dev/null
pnpm exec next start --port 3001 &
NEXT_PID=$!
popd >/dev/null

# Wait for Next.js
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3001/ >/dev/null 2>&1; then
    echo "[run-ci] Next.js ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[run-ci] ERROR: Next.js did not start"
    RESULT=1; exit 1
  fi
  sleep 1
done

# ── Start SW harness (proxies :3000 → Next :3001) ───────────────────────────
echo "[run-ci] starting SW harness on :3000..."
pushd "$PWA" >/dev/null
pnpm exec tsx e2e/sw-harness/server.ts &
SW_PID=$!
popd >/dev/null

sleep 2

# ── Run functional E2E (2 consecutive runs) ─────────────────────────────────
echo "[run-ci] run 1: functional E2E..."
pushd "$PWA" >/dev/null
pnpm exec playwright test \
  --config=e2e/playwright.config.ts \
  --project=functional-mobile \
  --workers=1 --retries=0 || RESULT=1

echo "[run-ci] run 2: functional E2E..."
pnpm exec playwright test \
  --config=e2e/playwright.config.ts \
  --project=functional-mobile \
  --workers=1 --retries=0 || RESULT=1
popd >/dev/null

# ── Run PWA runtime E2E ────────────────────────────────────────────────────
echo "[run-ci] PWA runtime E2E..."
pushd "$PWA" >/dev/null
pnpm exec playwright test \
  --config=e2e/playwright.config.ts \
  --project=pwa-runtime \
  --workers=1 --retries=0 || RESULT=1
popd >/dev/null

# ── Run desktop E2E (representative only) ───────────────────────────────────
echo "[run-ci] desktop E2E..."
pushd "$PWA" >/dev/null
pnpm exec playwright test \
  --config=e2e/playwright.config.ts \
  --project=functional-desktop \
  --workers=1 --retries=0 || RESULT=1
popd >/dev/null

# ── Run matrix gate ─────────────────────────────────────────────────────────
echo "[run-ci] matrix gate..."
pushd "$PWA" >/dev/null
node --experimental-strip-types --test e2e/support/matrix.test.ts || RESULT=1
popd >/dev/null

# ── Report ──────────────────────────────────────────────────────────────────
if [ "$RESULT" -eq 0 ]; then
  echo "[run-ci] ALL PASS"
else
  echo "[run-ci] FAILURES DETECTED"
fi

exit "$RESULT"
