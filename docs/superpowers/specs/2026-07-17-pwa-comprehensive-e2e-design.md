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
| `/__e2e/reset` | POST | body `{testId,seed}`; replaces only that testId store and journal |
| `/__e2e/scenario` | POST | body `{testId,method,path,delayMs?,status?,offline?,once?}`; next matching method+path request follows scenario |
| `/__e2e/journal` | GET | query `testId`; returns ordered `{method,path,body,status}` |
| `/__e2e/seed` | GET | query `testId`; returns the current deterministic fixture state |

All fixture data requests require `X-E2E-Test-ID`; missing IDs return 400. Playwright injects this header through `context.setExtraHTTPHeaders`, so stores and journals are parallel-safe. CORS allows only origin `http://127.0.0.1:3000`, allows methods `GET,POST,PATCH,DELETE,OPTIONS`, allows headers `content-type,authorization,x-e2e-test-id,x-device-token`, and handles `OPTIONS` preflight with appropriate response headers. No production credentials are exposed. Seeds use fixed clock `2026-07-17T12:00:00.000Z`, `America/Sao_Paulo`, `pt-BR`, stable IDs and money in cents. Before each test: reset fixture state, cookies, local/session storage, IndexedDB, CacheStorage and service-worker registrations.

## API fixture coverage
The fixture implements every export in `lib/api/endpoints.ts`: accounts, categories, transactions, payables, budgets, goals, cards/accounts, statements, purchases, subscriptions, profile and quick insights; plus `/auth/devices/register` and `/auth/devices/me`. Lists return production wrappers `{items,total}`, transactions `{items,total}`, profile `{profile}`. Mutations validate bodies, mutate only the scoped store and journal every request. Scenarios provide deterministic delay, 401, 422, 500 and network-abort responses.

## Playwright architecture
- `e2e/fixtures/`: unauthenticated, seeded, empty, degraded/error and offline contexts.
- `e2e/support/`: reset, API-journal assertions, fixed clock, route navigation and browser-failure guard.
- `e2e/specs/`: feature-oriented specs named in the matrix.
- Use role/name/label locators. Add `aria-label`; add `data-testid` only for repeated unnamed cards.

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

The coordinator is a React component mounted inside `UnsavedChangesProvider`. On boot it calls `navigator.serviceWorker.register('/sw.js')` and observes the `updatefound` event. When a waiting worker is detected (`registration.waiting`), the coordinator checks `UnsavedChangesProvider` for dirty state:
- **Clean** (no unsaved changes): dispatches `CLEAN_UPDATE` message via `registration.waiting.postMessage({type:'CLEAN_UPDATE'})` and reloads the page once
- **Dirty** (unsaved changes present): retains the waiting worker without activation — no message sent, no reload

The coordinator null-checks `registration.waiting` before access. Registration is not implicit — the component explicitly calls `register('/sw.js')` at mount time.

### SW registration and coordinator harness

A harness for two-version SW testing must:
- **Seed legacy cache entries** (e.g. old `pi-finance-shell` items) in CacheStorage via `page.evaluate` before the updated worker activates; the legacy worker itself is **never seeded in CacheStorage** — a service worker cannot be loaded from CacheStorage
- **Serve the legacy SW and the updated SW sequentially through the same registered URL `/sw.js`** (first deploy old build, then replace with updated build); this triggers the real `updatefound` event on the same `registration`
- **Control the deployment sequence** so Playwright can observe both `statechange` cycles: legacy activate → updated install → updated activate
- Assert that old cached chunks are never requested after activation completes
- Assert that route HTML and `_rsc` responses are not re-cached by the new worker
- Verify clean forms (no unsaved changes) activate the waiting worker and reload once
- Verify dirty forms (unsaved changes present) retain the waiting worker without forcing activation

Both versions are served through the same `/sw.js` path; the test harness deploys the legacy build first, then atomically replaces it with the updated build to trigger the update flow on the existing `registration`.

## CI topology
New `pwa-e2e` job (Ubuntu, Node 20, pnpm 9, 25-minute timeout) runs after install: `playwright install --with-deps chromium`. Before tests:
- Build PWA with `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL=http://127.0.0.1:4010`
- Start fixture API on `127.0.0.1:4010` and PWA on `127.0.0.1:3000`
- Wait for both `http://127.0.0.1:4010/__e2e/health` and `http://127.0.0.1:3000` readiness before test execution
- Each project uses isolated browser contexts and storage partitions; `pwa-runtime` uses a separate browser context with `serviceWorkers: 'allow'` to isolate cache/registration without changing the origin (all projects share `http://127.0.0.1:3000`)

Execution: mobile, desktop, runtime with `--workers=1 --retries=0`; two consecutive full runs form the gate. `production-smoke` only on manual dispatch with explicit URL and no fixture. After tests: teardown fixture API, PWA process, and clean test artifacts. Upload `apps/pwa/test-results`, `playwright-report`, traces, screenshots and videos on failure. Existing `quality` remains focused and does not absorb the full suite.

## Final gates
1. Matrix has no unowned action ID.
2. Full suite passes twice consecutively with `--retries=0`.
3. Lint, Vitest/coverage, Cloudflare build and Wrangler local checks pass.
4. **Production isolation.** Full automated suite and CI never contact, read from, or write to production. Manual production-smoke (opt-in via `E2E_PRODUCTION_SMOKE=1`) may only read public/unauthenticated route HTML to validate styling and shell rendering. Production-smoke never registers a device, never sends credentials, and never writes. All other tests operate exclusively against the local fixture API (`127.0.0.1:4010`).
