#!/usr/bin/env bash
# PWA E2E CI runner
# Spawns fixture API + Next.js + SW harness, runs E2E, cleans up.
# Usage: bash apps/pwa/e2e/run-ci.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PWA="$ROOT/apps/pwa"
RESULT=0

# Point the PWA at the local fixture API. REQUIRED.
#
# src/lib/api/client.ts:baseUrl() returns undefined when this is unset and the
# host is not the production PWA — which puts the app in mock mode, so the
# registration screen never renders and every spec fails on
# getByRole("button", { name: "Registrar" }).
#
# NEXT_PUBLIC_* is inlined at build time, so this must be exported before
# `pnpm build:next:cloudflare`, not only before `next start`.
export NEXT_PUBLIC_PI_FINANCE_API_BASE_URL="${NEXT_PUBLIC_PI_FINANCE_API_BASE_URL:-http://127.0.0.1:4010}"
echo "[run-ci] API base URL: $NEXT_PUBLIC_PI_FINANCE_API_BASE_URL"

FIXTURE_PID=""
NEXT_PID=""
SW_PID=""

cleanup() {
  echo "[run-ci] cleaning up..."
  [ -n "${FIXTURE_PID:-}" ] && kill "$FIXTURE_PID" 2>/dev/null || true
  [ -n "${NEXT_PID:-}" ] && kill "$NEXT_PID" 2>/dev/null || true
  [ -n "${SW_PID:-}" ] && kill "$SW_PID" 2>/dev/null || true
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

# ── Run functional E2E ──────────────────────────────────────────────────────
echo "[run-ci] functional E2E..."
pushd "$PWA" >/dev/null
pnpm exec playwright test \
  --config=e2e/playwright.config.ts \
  --project=functional-mobile \
  --workers=2 --retries=1 || RESULT=1
popd >/dev/null

# ── Run PWA runtime E2E ────────────────────────────────────────────────────
echo "[run-ci] PWA runtime E2E..."
pushd "$PWA" >/dev/null
pnpm exec playwright test \
  --config=e2e/playwright.config.ts \
  --project=pwa-runtime \
  --workers=1 --retries=0 || RESULT=1
popd >/dev/null
# ── Run push runtime E2E with real Service Worker + browser Permission API ─────
echo "[run-ci] push runtime E2E..."
pushd "$PWA" >/dev/null
pnpm exec playwright test \
  --config=e2e/playwright.config.ts \
  --project=push-runtime \
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
pnpm exec tsx --test e2e/support/matrix.test.ts || RESULT=1
popd >/dev/null

# ── Report ──────────────────────────────────────────────────────────────────
if [ "$RESULT" -eq 0 ]; then
  echo "[run-ci] ALL PASS"
else
  echo "[run-ci] FAILURES DETECTED"
fi

exit "$RESULT"
