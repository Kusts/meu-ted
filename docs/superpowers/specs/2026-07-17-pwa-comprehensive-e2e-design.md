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
| `/__e2e/scenario` | POST | body `{testId,delayMs?,status?,offline?,once?}`; next matching request follows scenario |
| `/__e2e/journal` | GET | query `testId`; returns ordered `{method,path,body,status}` |
| `/__e2e/seed` | GET | query `testId`; returns the current deterministic fixture state |

All fixture data requests require `X-E2E-Test-ID`; missing IDs return 400. Playwright injects this header through `context.setExtraHTTPHeaders`, so stores and journals are parallel-safe. CORS allows only `http://127.0.0.1:3000` and exposes no production credentials. Seeds use fixed clock `2026-07-17T12:00:00.000Z`, `America/Sao_Paulo`, `pt-BR`, stable IDs and money in cents. Before each test: reset fixture state, cookies, local/session storage, IndexedDB, CacheStorage and service-worker registrations.

## API fixture coverage
The fixture implements every export in `lib/api/endpoints.ts`: accounts, categories, transactions, payables, budgets, goals, cards/accounts, statements, purchases, subscriptions, profile and quick insights; plus `/auth/devices/register` and `/auth/devices/me`. Lists return production wrappers `{items,total}`, transactions `{items,total}`, profile `{profile}`. Mutations validate bodies, mutate only the scoped store and journal every request. Scenarios provide deterministic delay, 401, 422, 500 and network-abort responses.

## Playwright architecture
- `e2e/fixtures/`: unauthenticated, seeded, empty, degraded/error and offline contexts.
- `e2e/support/`: reset, API-journal assertions, fixed clock, route navigation and browser-failure guard.
- `e2e/specs/`: feature-oriented specs named in the matrix.
- Use role/name/label locators. Add `aria-label`; add `data-testid` only for repeated unnamed cards.

The failure guard is enabled for every test and rejects console/page errors, CSP violations, `ChunkLoadError`, request failures and HTTP >=400. A negative test calls `allowFailure({status|url|message,reason})` before the expected failure; undeclared failures always fail.

## Projects
- `functional-mobile`: 390x844, SW blocked, complete matrix, `workers: 1` initially.
- `functional-desktop`: 1440x900, navigation/layout plus representative writes.
- `pwa-runtime`: SW allowed, serial, own isolated origin/storage.
- `production-smoke`: disabled unless `E2E_PRODUCTION_SMOKE=1`; read-only/no registration/no writes.

## Navigation and PWA acceptance
Each route has direct-load ownership and client-navigation ownership: BottomNav covers `/`, `/registros`, `/a-pagar`; More covers `/patrimonio`, `/contas`, `/cartoes`, `/assinaturas`, `/orcamentos`, `/metas`, `/categorias`, `/relatorios`; Home/profile controls cover `/perfil`.

`pwa-runtime` asserts: legacy `pi-finance-shell` is deleted; route HTML and `_rsc` responses never enter CacheStorage; only `offline-shell.html/js` are precached; offline navigation falls back only after network failure; old chunk URLs are never requested after activation; clean forms activate a waiting worker once; dirty forms retain it. The coordinator is mounted within `UnsavedChangesProvider` and handles absent `registration.waiting` safely.

## CI topology
New `pwa-e2e` job (Ubuntu, Node 20, pnpm 9, 25-minute timeout) runs after install: `playwright install --with-deps chromium`; fixture API `4010`; PWA `3000`; mobile then desktop then runtime with `--workers=1 --retries=1`; `production-smoke` only on manual dispatch with explicit URL. Upload `apps/pwa/test-results`, `playwright-report`, traces, screenshots and videos on failure. Existing `quality` remains focused and does not absorb the full suite.

## Final gates
1. Matrix has no unowned action ID.
2. Full suite passes twice consecutively.
3. Lint, Vitest/coverage, Cloudflare build and Wrangler local checks pass.
4. No test contacts or mutates production.
