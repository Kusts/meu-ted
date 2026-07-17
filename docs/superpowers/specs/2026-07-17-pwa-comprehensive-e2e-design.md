# PWA Comprehensive E2E Design

## Goal
Create a deterministic, production-like Playwright suite that proves all PWA routes and visible actions work without production data or unexpected browser/runtime failures.

## Boundaries
- Test PWA UI + HTTP contract only; never mutate production or the Hostinger API.
- “Complete” means each visible user action has one assigned happy-path test plus validation/error coverage when it writes or can fail. It does not mean combinatorial permutations.
- Mobile executes the full functional matrix. Desktop executes navigation/layout plus representative CRUD flows. PWA runtime is isolated.

## Architecture
`apps/pwa/e2e/fixture-api/` is a local resettable HTTP server. It owns deterministic seeds, mutable in-memory stores, request recording, configured errors/delays, and a reset endpoint used before every test. The app starts with `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL` pointing to this server.

`apps/pwa/e2e/fixtures/` owns Playwright fixtures: unauthenticated, authenticated seeded, empty, degraded/error, and offline. `apps/pwa/e2e/support/` owns route helpers, API assertions and a global browser-failure guard. The guard fails on unexpected console/page errors, CSP violations, `ChunkLoadError`, failed requests, and HTTP >=400; expected fixture failures must be declared by a test.

## Projects
- `functional-mobile`: 390x844, SW blocked; every matrix row.
- `functional-desktop`: desktop viewport; shell/navigation and representative create/edit/error flows.
- `pwa-runtime`: SW allowed; install, controller reload, offline fallback, dirty-update behavior and old-cache migration.
- `production-smoke`: explicit opt-in/read-only, no auth registration or mutation.

## Fixture API
The fixture server implements every endpoint called by `lib/api/endpoints.ts`, returns the production response shapes (`{items,total}` list wrappers, profile wrapper, transaction wrapper), validates write payloads, records calls, and mutates its test-local store. A scenario header/query configures delay, 401, 422, 500 and offline/network-abort behavior. Each test resets seeds and browser storage.

## Locators and observability
Use role/name/label locators. Add `aria-label` first; use stable `data-testid` only where repeated visual cards have no accessible name. Tests assert response method/path/body and visible state, not implementation state.

## PWA contract
Navigation documents/RSC responses must never be retained in a fixed runtime cache. Offline only serves the precached `offline-shell.html`. Legacy `pi-finance-shell` is deleted during activation. The SW coordinator is mounted inside the unsaved-changes provider, treats `registration.waiting` as nullable, sends `CLEAN_UPDATE` only for clean state, and reloads once after controller change. Dirty forms retain the waiting worker.

## CI
A dedicated E2E workflow/job installs Chromium, starts fixture API + PWA, runs projects separately, and uploads trace/video/screenshot/test-result artifacts on failure. It is separate from the existing 15-minute quality job.

## Acceptance
1. Every matrix row has a named owning spec.
2. All 13 routes load directly and via client navigation where reachable.
3. Every action validates the expected UI and fixture API mutation.
4. Full suite passes twice consecutively.
5. Lint, Vitest, coverage, Cloudflare build, Wrangler local test and E2E all pass.
6. No production mutation occurs during tests.
