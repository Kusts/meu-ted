# PWA Comprehensive E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver deterministic end-to-end coverage for every action ID in `docs/testing/pwa-e2e-coverage-matrix.md` without production mutations.

**Architecture:** A scoped local fixture API supplies production-shaped HTTP responses and a request journal. Playwright projects drive the real PWA against that fixture with browser-failure guards; PWA runtime uses an isolated SW-enabled project. CI runs E2E separately from quality.

**Tech Stack:** Next.js 16, TypeScript, Playwright 1.61, Vitest, Serwist, Node HTTP.

**Agent Orchestration:** **Supervisor-Workers** — infrastructure, feature-spec groups, PWA runtime, and CI are independent bounded lanes; supervisor verifies filesystem and exits after each lane.

---

### Task 1: Fixture API protocol and deterministic stores

**Files:** Create `apps/pwa/e2e/fixture-api/server.ts`, `apps/pwa/e2e/fixture-api/store.ts`, `apps/pwa/e2e/fixture-api/seeds.ts`, `apps/pwa/e2e/fixture-api/server.test.ts`; modify `apps/pwa/package.json` and `pnpm-lock.yaml` (add `tsx` devDep, `pnpm install`).

- [ ] **Step 1: Write failing protocol tests**
```ts
it('resets only the requested test store', async () => {
  await request('/__e2e/reset', { testId: 'a', seed: 'populated' });
  await request('/__e2e/reset', { testId: 'b', seed: 'empty' });
  expect((await journal('a')).length).toBe(0);
  expect((await seed('b')).accounts).toEqual([]);
});
```
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec vitest run e2e/fixture-api/server.test.ts`; expect missing module/failing protocol.
- [ ] **Step 3: Implement** scoped `Map<string, TestStore>`, fixed clock `2026-07-17T12:00:00.000Z`. Add `tsx` as devDependency in `apps/pwa/package.json`. Endpoints:
  - `GET /__e2e/health` — no testId, no journal, returns `{ok:true}`
  - `POST /__e2e/reset` — body `{testId,seed}`
  - `POST /__e2e/scenario` — body `{testId,method,pathname,search?,delayMs?,status?,offline?,once?}`; matches normalized pathname+search; offline aborts via `socket.destroy()`
  - `GET /__e2e/journal` — query `testId`
  - `GET /__e2e/seed` — query `testId`
  Required `X-E2E-Test-ID` on all except `/__e2e/health`. CORS restricted to origin `http://127.0.0.1:3000`, methods `GET,POST,PATCH,DELETE,OPTIONS`, headers `content-type,authorization,x-e2e-test-id,x-device-token`, OPTIONS preflight handler. Journal `{method,path,body,status}`.
- [ ] **Step 4: GREEN** — same command passes; add tests for missing test ID 400, delay/401/422/500/abort scenario.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/fixture-api/server.ts apps/pwa/e2e/fixture-api/store.ts apps/pwa/e2e/fixture-api/seeds.ts apps/pwa/e2e/fixture-api/server.test.ts apps/pwa/package.json apps/pwa/pnpm-lock.yaml && git commit -m "test: add scoped pwa e2e fixture api"`.

### Task 2: Endpoint compatibility

**Files:** Modify `apps/pwa/e2e/fixture-api/server.ts`; test `apps/pwa/e2e/fixture-api/contracts.test.ts`.

- [ ] **Step 1: RED** assert every endpoint returns its specific contract:
```ts
// Lists (GET return {items,total})
it.each(['/accounts','/categories','/payables','/budgets','/goals','/cards/accounts','/cards/statements','/subscriptions'])('%s returns {items,total}', async path => {
  expect(await get(path)).toMatchObject({ items: expect.any(Array), total: expect.any(Number) });
});
it('/transactions returns {items,total} with params', async () => {
  expect(await get('/transactions?limit=10')).toMatchObject({ items: expect.any(Array), total: expect.any(Number) });
});
// Statement detail (direct response, no wrapper)
it('/cards/statements/:id returns detail directly', async () => {
  expect(await get('/cards/statements/1')).not.toHaveProperty('items');
});
// Profile wrapper
it('/profile returns {profile} wrapper', async () => {
  expect(await get('/profile')).toMatchObject({ profile: expect.any(Object) });
});
// Quick insights (items but no total)
it('/insights/quick returns {items}', async () => {
  expect(await get('/insights/quick')).toMatchObject({ items: expect.any(Array) });
  expect(await get('/insights/quick')).not.toHaveProperty('total');
});
```
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec vitest run e2e/fixture-api/contracts.test.ts`.
- [ ] **Step 3: Implement** per-endpoint contracts (from design doc table — 50 rows). Key specifics: auth register `{token,deviceId,householdId}`; `/auth/devices/me` returns `{deviceId,householdId}` directly (not wrapped); `/cards/installments` returns `{items:Transaction[]}` (wrapped); deactivation endpoints and `DELETE` return **200 with the mutated entity** (confirmed from backend routes); pay/cancel/contribute return the mutated entity. All mutate only the test-scoped store.
- [ ] **Step 4: GREEN** — command passes and journal asserts method/body for each mutation.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/fixture-api/server.ts apps/pwa/e2e/fixture-api/contracts.test.ts && git commit -m "test: cover pwa fixture endpoint contracts"`.

### Task 3: Playwright foundation and guard

**Files:** Create `apps/pwa/e2e/playwright.config.ts` (projects: functional-mobile, functional-desktop, pwa-runtime, production-smoke; each with explicit testMatch scoped to own spec dir), `apps/pwa/e2e/guard-fixture.config.ts` (dedicated, testMatch only guard-fixture/), `apps/pwa/e2e/guard-fixture/guard.spec.ts`, `apps/pwa/e2e/fixtures/app.ts`, `apps/pwa/e2e/support/failure-guard.ts`, `apps/pwa/e2e/support/failure-guard.test.ts`, `apps/pwa/e2e/support/guard-runner.test.ts`, `apps/pwa/e2e/support/reset.ts`; modify `apps/pwa/package.json`.

- [ ] **Step 1: RED** — write three tests:
```ts
// failure-guard.test.ts (vitest unit — guard not yet implemented)
import { createGuard } from './failure-guard';
it('rejects console.error with undeclared CSP message', () => {
  const guard = createGuard();
  expect(() => guard.onConsoleMessage({ type: 'error', text: 'Content Security Policy violation' }))
    .toThrow('Undeclared console error');
});
it('allows declared failure', () => {
  const guard = createGuard();
  guard.allowFailure({ message: 'CSP violation', reason: 'expected' });
  expect(() => guard.onConsoleMessage({ type: 'error', text: 'Content Security Policy violation' }))
    .not.toThrow();
});
```
```ts
// guard-runner.test.ts (vitest parent — spawns child via dedicated guard config)
import { spawnSync } from 'child_process';
it('guard spec exits non-zero and logs guard message on undeclared CSP', () => {
  const { status, stderr, stdout } = spawnSync('pnpm', [
    'exec', 'playwright', 'test',
    '--config=e2e/guard-fixture.config.ts'
  ], { cwd: 'apps/pwa', encoding: 'utf-8' });
  expect(status).not.toBe(0);
  expect(stderr + stdout).toContain('Undeclared console error');
  // Portável — exit não-zero + mensagem estável do guard
});
```
```ts
// e2e/guard-fixture/guard.spec.ts (playwright child runner — intentionally triggers CSP error)
test('fails undeclared CSP violations', async ({ page }) => {
  await page.evaluate(() => console.error('Content Security Policy violation'));
});
```
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec vitest run e2e/support/failure-guard.test.ts` (unit fails — guard not impl) and `pnpm --dir apps/pwa exec vitest run e2e/support/guard-runner.test.ts` (parent fails — dedicated config missing or guard not impl).
- [ ] **Step 3: Implement** projects `functional-mobile` (390x844, SW block, testMatch: `functional/**` only), `functional-desktop` (1440x900, testMatch: `functional/**`), `pwa-runtime` (SW allowed, serial, testMatch: `pwa/**`), `production-smoke` (explicit URL, disabled unless env set, testMatch: `smoke/**`). Dedicated guard config `e2e/guard-fixture.config.ts` (`testMatch: guard-fixture/**` only). Fixture reset/header/storage/IndexedDB/cache/SW cleanup; `allowFailure({status?,url?,message?,reason})`.
- [ ] **Step 4: GREEN** — `pnpm --dir apps/pwa exec vitest run e2e/support/failure-guard.test.ts` (unit passes); `pnpm --dir apps/pwa exec vitest run e2e/support/guard-runner.test.ts` (parent passes because child exit non-zero and stderr/stdout contains exact `Undeclared console error`); expected declared 422 passes; undeclared console/page/CSP/chunk/request/HTTP failure fails.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/playwright.config.ts apps/pwa/e2e/guard-fixture.config.ts apps/pwa/e2e/guard-fixture/guard.spec.ts apps/pwa/e2e/fixtures/app.ts apps/pwa/e2e/support/failure-guard.ts apps/pwa/e2e/support/failure-guard.test.ts apps/pwa/e2e/support/guard-runner.test.ts apps/pwa/e2e/support/reset.ts apps/pwa/package.json && git commit -m "test: add deterministic pwa playwright foundation"`.

### Task 4: Auth, direct-load and navigation IDs

**Files:** Create `apps/pwa/e2e/specs/auth.spec.ts`, `apps/pwa/e2e/specs/navigation.spec.ts`.

- [ ] **Step 1: RED** implement tests for `AUTH-01`, `AUTH-02`, `DIRECT-01..12` (direct load all 12 routes), `NAV-01..13` (client navigation), and exact BottomNav/More button clicks.
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts e2e/specs/auth.spec.ts e2e/specs/navigation.spec.ts`.
- [ ] **Step 3: Implement only required accessibility labels/test IDs** where semantic button names are absent; no behavior refactor.
- [ ] **Step 4: GREEN** assert URLs, fixture journal, styled shell, and zero guard failures.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/specs/auth.spec.ts apps/pwa/e2e/specs/navigation.spec.ts && git commit -m "test: cover pwa auth, direct-load and navigation e2e"`.

### Task 5: Transaction, home, records

**Files:** Create `transaction-sheet.spec.ts`, `home.spec.ts`, `records.spec.ts` under `apps/pwa/e2e/specs/`.

- [ ] **Step 1: RED** encode `TX-01..09`, `HOME-01..10`, `REC-01..06` as role-driven flows; assert exact journal calls such as `POST /transactions/expense`, `POST /transfers`, `PATCH /transactions/:id`, `DELETE /transactions/:id`.
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts --project=functional-mobile e2e/specs/transaction-sheet.spec.ts e2e/specs/home.spec.ts e2e/specs/records.spec.ts`.
- [ ] **Step 3: Implement fixture seed/handlers and minimal labels only.**
- [ ] **Step 4: GREEN** — same command exits 0; cover cancel, validation, 422 and 500 state preservation/retry.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/specs/transaction-sheet.spec.ts apps/pwa/e2e/specs/home.spec.ts apps/pwa/e2e/specs/records.spec.ts && git commit -m "test: cover transaction home and records e2e"`.

### Task 6: Accounts through cards

**Files:** Create `accounts.spec.ts`, `categories.spec.ts`, `payables.spec.ts`, `budgets.spec.ts`, `goals.spec.ts`, `cards.spec.ts`.

- [ ] **Step 1: RED** implement atomic IDs `ACC-01..06`, `CAT-01..05`, `PAY-01..06`, `BUD-01..04`, `GOAL-01..06`, `CARD-01..08`.
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts --project=functional-mobile e2e/specs/accounts.spec.ts e2e/specs/categories.spec.ts e2e/specs/payables.spec.ts e2e/specs/budgets.spec.ts e2e/specs/goals.spec.ts e2e/specs/cards.spec.ts`.
- [ ] **Step 3: Implement fixture mutations** for accounts/cards/categories/payables/budgets/goals/statements/purchases; verify journal payloads and rendered totals/statuses.
- [ ] **Step 4: GREEN** — same command exits 0; each write has validation, cancel, and declared API-error assertion.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/specs/accounts.spec.ts apps/pwa/e2e/specs/categories.spec.ts apps/pwa/e2e/specs/payables.spec.ts apps/pwa/e2e/specs/budgets.spec.ts apps/pwa/e2e/specs/goals.spec.ts apps/pwa/e2e/specs/cards.spec.ts && git commit -m "test: cover pwa financial feature e2e"`.

### Task 7: Remaining features and shared UI

**Files:** Create `subscriptions.spec.ts`, `wallet.spec.ts`, `reports.spec.ts`, `profile.spec.ts`, `shared-ui.spec.ts`.

- [ ] **Step 1: RED** implement `SUB-01..05`, `WAL-01..10`, `REP-01..04`, `PROF-01..06`, `UI-01..08`.
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts --project=functional-mobile e2e/specs/subscriptions.spec.ts e2e/specs/wallet.spec.ts e2e/specs/reports.spec.ts e2e/specs/profile.spec.ts e2e/specs/shared-ui.spec.ts`.
- [ ] **Step 3: Implement fixture support and minimal labels** for notification dismiss/navigation, profile variants, stale/write-error banners and confirm dialog actions.
- [ ] **Step 4: GREEN** — same command exits 0; assert empty/degraded, cancel and retry branches.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/specs/subscriptions.spec.ts apps/pwa/e2e/specs/wallet.spec.ts apps/pwa/e2e/specs/reports.spec.ts apps/pwa/e2e/specs/profile.spec.ts apps/pwa/e2e/specs/shared-ui.spec.ts && git commit -m "test: cover remaining pwa e2e surfaces"`.

### Task 8: PWA stale-cache regression and coordinator

**Files:** Create `apps/pwa/e2e/sw-harness/server.ts`, `apps/pwa/e2e/sw-harness/legacy-sw.js` (legacy build artifact, concrete path); modify `apps/pwa/src/sw.ts`, `apps/pwa/src/components/RootProviders.tsx`, `apps/pwa/src/lib/sw-coordinator.tsx`; create/modify `apps/pwa/e2e/specs/pwa-runtime.spec.ts`, `apps/pwa/src/sw-runtime.test.ts`, `apps/pwa/src/lib/sw-coordinator.test.tsx`.

Provider tree: `UnsavedChangesProvider > SWCoordinator > AppStateProvider > SheetProvider` — all consumers inside.

- [ ] **Step 1: RED** write PWA tests for `PWA-01..06`. Use the SW harness (`e2e/sw-harness/server.ts` on `127.0.0.1:3000`, proxying to Next on `127.0.0.1:3001`). Playwright `baseURL` is `http://127.0.0.1:3000`. No fictional APIs — use real browser SW API:
```ts
test('never caches route HTML and removes legacy shell cache', async ({ page }) => {
  // Deploy legacy SW via harness
  await page.evaluate(() => fetch('/__e2e/sw/deploy', { method:'POST', body: JSON.stringify({version:'legacy'}) }));
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // Seed legacy cache entries
  await page.evaluate(() => caches.open('pi-finance-shell').then(c => c.put('/registros', new Response('legacy'))));
  // Deploy updated SW
  await page.evaluate(() => fetch('/__e2e/sw/deploy', { method:'POST', body: JSON.stringify({version:'current'}) }));
  // Force update check
  const reg = await page.evaluate(() => navigator.serviceWorker.getRegistration());
  await reg.update();
  // Coordinator detects waiting worker → clean → CLEAN_UPDATE → reload
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // Legacy cache should be cleared
  expect(await cacheEntries(page, 'pi-finance-shell')).toEqual([]);
});
test('clean form activates waiting worker once', async ({ page }) => {
  await page.evaluate(() => fetch('/__e2e/sw/deploy', { method:'POST', body: JSON.stringify({version:'legacy'}) }));
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.evaluate(() => fetch('/__e2e/sw/deploy', { method:'POST', body: JSON.stringify({version:'current'}) }));
  const reg = await page.evaluate(() => navigator.serviceWorker.getRegistration());
  await reg.update();
  // Clean → coordinator sends CLEAN_UPDATE → skipWaiting → controller changes
  await page.waitForFunction(
    old => navigator.serviceWorker.controller?.state !== old,
    await page.evaluate(() => navigator.serviceWorker.controller?.state)
  );
});
test('dirty form retains waiting worker without activation', async ({ page }) => {
  await page.evaluate(() => fetch('/__e2e/sw/deploy', { method:'POST', body: JSON.stringify({version:'legacy'}) }));
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // Fill a form to make page dirty (real browser interaction)
  await page.getByRole('button', { name: 'Nova despesa' }).click();
  await page.getByLabel('Descrição').fill('Test dirty');
  // Deploy updated SW
  await page.evaluate(() => fetch('/__e2e/sw/deploy', { method:'POST', body: JSON.stringify({version:'current'}) }));
  const reg = await page.evaluate(() => navigator.serviceWorker.getRegistration());
  await reg.update();
  // Dirty: coordinator should NOT activate — same controller remains
  await page.waitForTimeout(1000);
  const stillActive = await page.evaluate(() => navigator.serviceWorker.controller?.state);
  expect(stillActive).toBe('activated');
  expect(page.url()).not.toContain('/login'); // page didn't reload
});
```
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts --project=pwa-runtime e2e/specs/pwa-runtime.spec.ts`.
- [ ] **Step 3: Implement** network-only navigation plus precached offline-shell fallback; delete legacy `pi-finance-shell` on activate; never cache HTML/RSC. Provider tree: `UnsavedChangesProvider > SWCoordinator > AppStateProvider > SheetProvider`. The `SWCoordinator` component calls `navigator.serviceWorker.register('/sw.js')` on mount, listens for `updatefound` on the registration. When `registration.waiting` is detected: checks dirty state from `UnsavedChangesProvider` context — if clean, calls `registration.waiting.postMessage({type:'CLEAN_UPDATE'})` and reloads; if dirty, retains waiting worker. The harness (`e2e/sw-harness/server.ts`, legacy artifact at `e2e/sw-harness/legacy-sw.js`) runs on `127.0.0.1:3000` proxying to Next on `3001`, except `/sw.js` and `/__e2e/sw/deploy`. Deployment: (1) `POST /__e2e/sw/deploy {"version":"legacy"}` → old `/sw.js`; (2) navigate → browser registers; (3) `POST /__e2e/sw/deploy {"version":"current"}` → new `/sw.js`; (4) browser detects change via `updatefound`; (5) coordinator checks dirty state → CLEAN_UPDATE or retain.
- [ ] **Step 4: GREEN** runtime test proves no old chunk request/404, no HTML/RSC cache, offline fallback only after abort, clean activates via CLEAN_UPDATE + reload, dirty retains waiting worker (same controller, no reload).
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/sw-harness/server.ts apps/pwa/e2e/sw-harness/legacy-sw.js apps/pwa/src/sw.ts apps/pwa/src/components/RootProviders.tsx apps/pwa/src/lib/sw-coordinator.tsx apps/pwa/e2e/specs/pwa-runtime.spec.ts apps/pwa/src/sw-runtime.test.ts apps/pwa/src/lib/sw-coordinator.test.tsx && git commit -m "fix: harden pwa cache migration and updates"`.

### Task 9: Desktop, smoke and matrix enforcement

**Files:** Create `apps/pwa/e2e/specs/production-smoke.spec.ts`, `apps/pwa/e2e/support/matrix.ts`, `apps/pwa/e2e/support/matrix.test.ts`.

- [ ] **Step 1: RED** assert every matrix ID (`AUTH`, `DIRECT`, `NAV`, `TX`, `HOME`, `REC`, `ACC`, `CAT`... and `SMOKE-01..04`) has an owning spec via `[ID]` title annotations (no manual mapping). Production smoke validates unauthenticated registration shell only, refuses registration/write unless `E2E_PRODUCTION_SMOKE=1`.
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec vitest run e2e/support/matrix.test.ts` and `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts --project=production-smoke e2e/specs/production-smoke.spec.ts`.
- [ ] **Step 3: Implement** matrix enforcement extracts IDs from test title `[ID]` annotations; desktop representative flows; explicit production read-only guard.
- [ ] **Step 4: GREEN** — both commands exit 0; all IDs resolve and smoke is skipped by default.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/specs/production-smoke.spec.ts apps/pwa/e2e/support/matrix.ts apps/pwa/e2e/support/matrix.test.ts && git commit -m "test: enforce pwa e2e coverage matrix"`.

### Task 10: Separate CI E2E job

**Files:** Create `apps/pwa/e2e/run-ci.sh` (chmod +x); modify `.github/workflows/pwa-ci.yml`; create `apps/pwa/e2e/README.md`. (SW harness was created in Task 8.)

- [ ] **Step 1: RED** — create `apps/pwa/e2e/run-ci.sh` stub that calls a nonexistent binary; verify it exits non-zero before CI infra exists.
- [ ] **Step 2: Implement** — CI job timeout >= 45 minutes. `run-ci.sh` per design doc (3 services, trap before readiness, readiness timeout → exit 1, two consecutive full runs, no artifact removal). Artifact upload: `if: always()` preserves reports. `production-smoke` is the sole production project, opt-in via `workflow_dispatch` with `--project=production-smoke` and explicit URL (no fixture).
- [ ] **Step 3: GREEN** — `bash apps/pwa/e2e/run-ci.sh` exits 0; inspect `test-results` and logs.
- [ ] **Step 4: Commit** `git add .github/workflows/pwa-ci.yml apps/pwa/e2e/README.md apps/pwa/e2e/run-ci.sh apps/pwa/e2e/sw-harness/server.ts && git commit -m "ci: run comprehensive pwa e2e separately"`.

### Task 11: Final verification

**Files:** Modify coverage matrix only if action IDs changed.

- [ ] **Step 1:** `pnpm --dir apps/pwa lint` → exit 0.
- [ ] **Step 2:** `pnpm --dir apps/pwa exec vitest run --coverage` → thresholds pass.
- [ ] **Step 3:** `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts --workers=1 --retries=0` twice consecutively → both exit 0.
- [ ] **Step 4:** `pnpm --dir apps/pwa build:cloudflare` and Wrangler local E2E runtime check → exit 0.
- [ ] **Step 5:** validate all action IDs via `[ID]` title annotations; verify fixed clock before first navigation; `git diff --check`; `! git grep -nE 'git commit -a(m| )' docs/` (no output = pass); request read-only review.
- [ ] **Step 6: Commit** `git add docs/testing/pwa-e2e-coverage-matrix.md && git commit -m "test: finalize pwa comprehensive e2e coverage"` if verification changes tracked files.

## Plan self-review
- Spec coverage: Tasks 1–10 map fixture protocol, all action IDs, PWA migration, CI and smoke requirements.
- Placeholder scan: no TODO/TBD/implicit feature groups.
- Consistency: fixture port 4010 (127.0.0.1), PWA port 3000 (127.0.0.1), test header `X-E2E-Test-ID`, and project names are fixed across tasks.
