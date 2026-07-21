# PWA Comprehensive E2E Design

## Goal
Build deterministic Playwright coverage for all 12 application routes and every visible user action, without production data or mutations.

## Scope contract
- Application pages: `/`, `/registros`, `/a-pagar`, `/assinaturas`, `/cartoes`, `/categorias`, `/contas`, `/metas`, `/orcamentos`, `/patrimonio`, `/perfil`, `/relatorios`.
- Separate non-page contracts: `manifest.webmanifest`, `/pwa-control`, `/api/observability/rum`, not-found, headers and static assets.
- Complete means every atomic matrix action has one owning happy-path test; writes additionally own validation and declared API-error coverage. It is not combinatorial coverage.

## Local fixture protocol
`apps/pwa/e2e/fixture-api/server.ts` listens on `127.0.0.1:4010`. The PWA process receives `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL=http://127.0.0.1:4010` before build/start.

| Endpoint | Method | Contract |
|---|---|---|
| `/__e2e/health` | GET | no auth, no testId, no journal; returns `{ok:true}` for readiness probe |
| `/__e2e/reset` | POST | body `{testId,seed}`; replaces only that testId store and journal |
| `/__e2e/scenario` | POST | body `{testId,method,pathname,search?,delayMs?,status?,offline?,once?}`; matches normalized pathname+search; `offline:true` aborts via `socket.destroy()` |
| `/__e2e/journal` | GET | query `testId`; returns ordered `{method,path,body,status}` |
| `/__e2e/seed` | GET | query `testId`; returns the current deterministic fixture state |

All fixture data requests require `X-E2E-Test-ID` (except `/__e2e/health`); missing IDs return 400. Playwright injects this header through `context.setExtraHTTPHeaders`, so stores and journals are parallel-safe. CORS allows only origin `http://127.0.0.1:3000`, allows methods `GET,POST,PATCH,DELETE,OPTIONS`, allows headers `content-type,authorization,x-e2e-test-id,x-device-token`, and handles `OPTIONS` preflight with appropriate response headers. No production credentials are exposed. Seeds use fixed clock `2026-07-17T12:00:00.000Z`, `America/Sao_Paulo`, `pt-BR`, stable IDs and money in cents. Before each test: set `page.clock.setFixedTime('2026-07-17T12:00:00.000Z')` before first navigation, then reset fixture state, cookies, local/session storage, IndexedDB, CacheStorage and service-worker registrations.

## API fixture coverage per endpoint
Contracts derived from actual backend responses (inspected `apiFetch` calls in `src/lib/api/`).

| Endpoint pattern | Method | Response shape | Notes |
|---|---|---|---|
| `/auth/devices/register` | POST | `{token:string, deviceId:string, householdId:string}` | Body `{deviceName}` |
| `/auth/devices/me` | GET | `{deviceId:string, householdId:string}` | Direct response, not wrapped |
| `/accounts` | GET | `{items:Account[], total:number}` | |
| `/accounts` | POST | `Account` | |
| `/accounts/:id` | PATCH | `Account` | |
| `/accounts/:id/deactivate` | POST | `Account` | 200 with entity |
| `/categories` | GET | `{items:Category[], total:number}` | |
| `/categories` | POST | `Category` | Subcategory via `parentId` |
| `/categories/:id` | PATCH | `Category` | |
| `/categories/:id/deactivate` | POST | `Category` | 200 with entity |
| `/transactions` | GET | `{items:Transaction[], total:number}` | Query params `kind`,`limit`,`offset` |
| `/transactions/expense` | POST | `Transaction` | |
| `/transactions/income` | POST | `Transaction` | |
| `/transactions/:id` | PATCH | `Transaction` | |
| `/transactions/:id` | DELETE | `Transaction` | 200 with entity (soft-delete, returns updated) |
| `/transfers` | POST | `Transaction` | |
| `/cards` | POST | `Account` | |
| `/cards/:id` | PATCH | `Account` | |
| `/cards/accounts` | GET | `{items:Account[], total:number}` | |
| `/cards/statements` | GET | `{items:CardStatement[], total:number}` | Query `accountId` |
| `/cards/statements/:id` | GET | `StatementDetail` | Direct, no wrapper |
| `/cards/statements/:id/pay` | POST | `CardStatement` | Body `{amountCents,fromAccountId}` |
| `/cards/purchases/:id` | PATCH | `StatementDetail` | |
| `/cards/installments` | POST | `{items:Transaction[]}` | Wrapped in items |
| `/payables` | GET | `{items:Payable[], total:number}` | Query `status` |
| `/payables` | POST | `Payable` | |
| `/payables/:id` | PATCH | `Payable` | |
| `/payables/:id/pay` | POST | `Payable` | Body `{paidDate?}` |
| `/payables/:id/unpay` | POST | `Payable` | |
| `/payables/:id/cancel` | POST | `Payable` | |
| `/budgets` | GET | `{items:Budget[], total:number}` | |
| `/budgets` | POST | `Budget` | |
| `/budgets/:id` | PATCH | `Budget` | |
| `/goals` | GET | `{items:Goal[], total:number}` | |
| `/goals` | POST | `Goal` | |
| `/goals/:id` | PATCH | `Goal` | |
| `/goals/:id/contribute` | POST | `Goal` | |
| `/goals/:id/cancel` | POST | `Goal` | |
| `/subscriptions` | GET | `{items:Subscription[], total:number}` | |
| `/subscriptions` | POST | `Subscription` | |
| `/subscriptions/:id` | PATCH | `Subscription` | |
| `/subscriptions/:id/cancel` | POST | `Subscription` | |
| `/profile` | GET | `{profile:Profile|null}` | |
| `/profile` | PATCH | `{profile:Profile}` | |
| `/insights/quick` | GET | `{items:QuickInsight[]}` | No `total` |

Mutations validate bodies, write to scoped store and journal every request. Scenarios match on normalized `pathname` + `search`; mode `offline:true` aborts via `socket.destroy()` without writing to journal.

**Important:** Backend evidence confirms `POST /accounts/:id/deactivate`, `/categories/:id/deactivate`, and `DELETE /transactions/:id` return **200 with the mutated entity** (not 204). The fixture must match these response shapes.

## Playwright architecture
- `e2e/fixtures/`: unauthenticated, seeded, empty, degraded/error and offline contexts.
- `e2e/support/`: reset, API-journal assertions, fixed clock, route navigation and browser-failure guard.
- `e2e/specs/`: feature-oriented specs named in the matrix.
- Use role/name/label locators. Add `aria-label`; add `data-testid` only for repeated unnamed cards.
- Clock fixed via `page.clock.setFixedTime('2026-07-17T12:00:00.000Z')` in `beforeEach` before first navigation.

## Ownership and annotation
Every test must include its matrix ID in the test title as `[ID]` (e.g. `[AUTH-01] registers device`). The matrix enforcement spec (`e2e/support/matrix.test.ts`) extracts IDs from spec titles rather than maintaining a separate mapping file. No manual mapping file is required — the matrix manifest is derived from title annotations.

The failure guard is enabled for every test and rejects console/page errors, CSP violations, `ChunkLoadError`, request failures and HTTP >=400. A negative test calls `allowFailure({status|url|message,reason})` before the expected failure; undeclared failures always fail.

The intentionally-failing guard child spec (`e2e/guard-fixture/guard.spec.ts`) is isolated from the main Playwright config via dedicated `e2e/guard-fixture.config.ts` which uses `testMatch: ['**/guard-fixture/**']`. The main config uses `testMatch: ['**/e2e/specs/**']`, so the guard spec is never discovered by the full suite. A Vitest parent test (`e2e/support/guard-runner.test.ts`) spawns `playwright test --config=e2e/guard-fixture.config.ts` via `spawnSync` and asserts exit code `!== 0` and stderr/stdout contains the exact guard message `Undeclared console error`. This prevents the deliberately-failing spec from breaking the full `playwright test` suite while still verifying guard coverage in the parent-child architecture.

## Projects
- `functional-mobile`: 390x844, SW blocked, complete matrix, `workers: 1` initially.
- `functional-desktop`: 1440x900, navigation/layout plus representative writes.
- `pwa-runtime`: SW allowed, serial, own isolated origin/storage.
- `production-smoke`: disabled unless `E2E_PRODUCTION_SMOKE=1`; read-only/no registration/no writes.

## Navigation and PWA acceptance
Each route has direct-load ownership and client-navigation ownership: BottomNav covers `/`, `/registros`, `/a-pagar`; More covers `/patrimonio`, `/contas`, `/cartoes`, `/assinaturas`, `/orcamentos`, `/metas`, `/categorias`, `/relatorios`; Home/profile controls cover `/perfil`.

`pwa-runtime` asserts: legacy `pi-finance-shell` is deleted; route HTML and `_rsc` responses never enter CacheStorage; only `offline-shell.html/js` are precached; offline navigation falls back only after network failure; old chunk URLs are never requested after activation; clean forms activate a waiting worker once; dirty forms retain it.

### SW coordinator component and registration

The `SWCoordinator` is a React component mounted **inside** `UnsavedChangesProvider` (which wraps all consumers needing dirty state). On mount, the coordinator calls `navigator.serviceWorker.register('/sw.js')` to ensure the SW is registered at the application level (not just build-time), then gets the `registration` via `navigator.serviceWorker.getRegistration()`. It listens for `updatefound` on the registration — when a waiting worker is detected (`registration.waiting`), it checks `UnsavedChangesProvider` for dirty state:
- **Clean** (no unsaved changes): dispatches `CLEAN_UPDATE` message via `registration.waiting.postMessage({type:'CLEAN_UPDATE'})` → SW calls `self.skipWaiting()` → page reloads once
- **Dirty** (unsaved changes present): retains the waiting worker without activation — no message sent, no reload

The coordinator exposes `{registerForUpdate, isDirty}` — tests call `registerForUpdate()` to trigger the update flow programmatically. The coordinator is mounted in `RootProviders` under `UnsavedChangesProvider`.

### SW registration and coordinator harness (`e2e/sw-harness/`)

SW registration is **origin-bound** — the page and `/sw.js` must share the same origin. Architecture:
- `e2e/sw-harness/server.ts` — Node HTTP server on `127.0.0.1:3000` that **proxies** all requests to the real Next.js server on `127.0.0.1:3001`, **except** `/sw.js` and `/__e2e/sw/deploy` which it handles directly
- Playwright `baseURL` is `http://127.0.0.1:3000`; the browser sees a single origin
- The harness serves a switchable `/sw.js`: a control endpoint `POST /__e2e/sw/deploy {"version":"legacy"|"current"}` atomically swaps which build artifact is served at that path
- Test sequence:
  1. `POST /__e2e/sw/deploy {"version":"legacy"}` → server will serve old `/sw.js`
  2. Navigate to `http://127.0.0.1:3000/` → browser registers SW from same origin → legacy activates
  3. Seed legacy cache entries via `page.evaluate`
  4. `POST /__e2e/sw/deploy {"version":"current"}` → `/sw.js` now serves new build
  5. `navigator.serviceWorker.getRegistration()` fires `updatefound` → `registration.waiting` populated
  6. Coordinator's `registerForUpdate()`: if clean → `CLEAN_UPDATE` → SW activates → reload

The harness must:
- Seed legacy cache entries before updated worker activates
- Control deployment sequence for observable `statechange` cycles
- Assert old chunks never requested after activation
- Assert route HTML and `_rsc` never enter CacheStorage
- Verify clean forms allow activation; dirty forms retain waiting worker

## CI topology

**Script:** `apps/pwa/e2e/run-ci.sh` — single entry point, starts all services in the same shell with trap cleanup set BEFORE background processes.

```bash
#!/usr/bin/env bash
set -euo pipefail

BUILD_DIR=apps/pwa
FIXTURE_PORT=4010
SW_HARNESS_PORT=3000
NEXT_PORT=3001

# Build with fixture URL
NEXT_PUBLIC_PI_FINANCE_API_BASE_URL=http://127.0.0.1:${FIXTURE_PORT} pnpm --dir ${BUILD_DIR} build

# Start Next.js on 3001 (internal — SW harness proxies 3000 → 3001)
pnpm --dir ${BUILD_DIR} exec next start --port ${NEXT_PORT} &
NEXT_PID=$!

# Start SW harness on 3000 (public origin: proxies to Next except /sw.js and /__e2e/sw/deploy)
pnpm --dir ${BUILD_DIR} exec tsx e2e/sw-harness/server.ts --target http://127.0.0.1:${NEXT_PORT} &
SW_PID=$!

# Start fixture API on 4010
pnpm --dir ${BUILD_DIR} exec tsx e2e/fixture-api/server.ts --port ${FIXTURE_PORT} &
FIXTURE_PID=$!

# Trap BEFORE readiness: kill services, DO NOT remove artifacts (they are preserved for upload)
trap 'kill $FIXTURE_PID $SW_PID $NEXT_PID 2>/dev/null; echo "Stopped services"' EXIT

# Readiness with timeout (fail hard on timeout)
for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:${FIXTURE_PORT}/__e2e/health && break
  [ "$i" = "30" ] && { echo "Fixture readiness timeout"; exit 1; }
  sleep 1
done
for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:${SW_HARNESS_PORT} && break
  [ "$i" = "30" ] && { echo "SW harness readiness timeout"; exit 1; }
  sleep 1
done

# Gate: two consecutive full runs (all projects included; smoke excluded by env/project)
pnpm --dir ${BUILD_DIR} exec playwright test --config=e2e/playwright.config.ts --workers=1 --retries=0
pnpm --dir ${BUILD_DIR} exec playwright test --config=e2e/playwright.config.ts --workers=1 --retries=0
```

`production-smoke` only on manual dispatch using `--project=production-smoke` with explicit production URL (no fixture, no CI script). All main projects (functional-mobile, functional-desktop, pwa-runtime) are included in the full run; smoke is excluded by default because `E2E_PRODUCTION_SMOKE` env is not set in CI. Each project uses isolated browser contexts and storage partitions. Upload `apps/pwa/test-results`, `playwright-report`, traces, screenshots and videos on failure.

## Final gates
1. Matrix has no unowned action ID.
2. Full suite passes twice consecutively with `--retries=0`.
3. Lint, Vitest/coverage, Cloudflare build and Wrangler local checks pass.
4. **Production isolation.** Full automated suite and CI never contact, read from, or write to production. Manual production-smoke (opt-in via `E2E_PRODUCTION_SMOKE=1`) may only read public/unauthenticated route HTML to validate styling and shell rendering. Production-smoke never registers a device, never sends credentials, and never writes. All other tests operate exclusively against the local fixture API (`127.0.0.1:4010`).
