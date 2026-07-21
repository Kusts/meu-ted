# PWA Comprehensive E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver deterministic end-to-end coverage for every action ID in `docs/testing/pwa-e2e-coverage-matrix.md` without production mutations.

**Architecture:** A scoped local fixture API supplies production-shaped HTTP responses and a request journal. Playwright projects drive the real PWA against that fixture with browser-failure guards; PWA runtime uses an isolated SW-enabled project. CI runs E2E separately from quality.

**Tech Stack:** Next.js 16, TypeScript, Playwright 1.61, Vitest, Serwist, Node HTTP.

**Agent Orchestration:** **Supervisor-Workers** — infrastructure, feature-spec groups, PWA runtime, and CI are independent bounded lanes; supervisor verifies filesystem and exits after each lane.

---

### Task 1: Fixture API protocol and deterministic stores

**Files:** Create `apps/pwa/e2e/fixture-api/server.ts`, `apps/pwa/e2e/fixture-api/store.ts`, `apps/pwa/e2e/fixture-api/seeds.ts`, `apps/pwa/e2e/fixture-api/server.test.ts`.

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
- [ ] **Step 3: Implement** scoped `Map<string, TestStore>`, fixed clock `2026-07-17T12:00:00.000Z`, endpoints `/__e2e/reset`, `/__e2e/scenario` (method+path matching), `/__e2e/journal`, `/__e2e/seed`, required `X-E2E-Test-ID`, CORS restricted to origin `http://127.0.0.1:3000`, methods `GET,POST,PATCH,DELETE,OPTIONS`, headers `content-type,authorization,x-e2e-test-id,x-device-token`, OPTIONS preflight handler returning appropriate CORS headers, and journal `{method,path,body,status}`.
- [ ] **Step 4: GREEN** — same command passes; add tests for missing test ID 400, delay/401/422/500/abort scenario.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/fixture-api/server.ts apps/pwa/e2e/fixture-api/store.ts apps/pwa/e2e/fixture-api/seeds.ts apps/pwa/e2e/fixture-api/server.test.ts && git commit -m "test: add scoped pwa e2e fixture api"`.

### Task 2: Endpoint compatibility

**Files:** Modify `apps/pwa/e2e/fixture-api/server.ts`; test `apps/pwa/e2e/fixture-api/contracts.test.ts`.

- [ ] **Step 1: RED** assert every endpoint exported by `src/lib/api/endpoints.ts` returns its contract:
```ts
it.each(['/accounts','/categories','/transactions','/payables','/budgets','/goals','/cards/accounts','/cards/statements','/subscriptions','/insights/quick'])('%s has production shape', async path => {
  expect(await get(path)).toMatchObject({ items: expect.any(Array) });
});
it('/profile returns {profile} wrapper', async () => {
  expect(await get('/profile')).toMatchObject({ profile: expect.any(Object) });
});
```
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec vitest run e2e/fixture-api/contracts.test.ts`.
- [ ] **Step 3: Implement** list `{items,total}`, transactions `{items,total}`, profile `{profile}`, auth register/me, and all create/update/delete/pay/cancel routes named in the matrix; mutate only the test-scoped store.
- [ ] **Step 4: GREEN** — command passes and journal asserts method/body for each mutation.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/fixture-api/server.ts apps/pwa/e2e/fixture-api/contracts.test.ts && git commit -m "test: cover pwa fixture endpoint contracts"`.

### Task 3: Playwright foundation and guard

**Files:** Create `apps/pwa/e2e/playwright.config.ts`, `apps/pwa/e2e/fixtures/app.ts`, `apps/pwa/e2e/support/failure-guard.ts`, `apps/pwa/e2e/support/failure-guard.test.ts`, `apps/pwa/e2e/support/guard-runner.test.ts`, `apps/pwa/e2e/support/reset.ts`, `apps/pwa/e2e/specs/guard.spec.ts`; modify `apps/pwa/package.json`.

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
// guard-runner.test.ts (vitest parent — spawns child Playwright spec)
import { spawnSync } from 'child_process';
it('child playwright spec exits non-zero on undeclared CSP', () => {
  const { status } = spawnSync('pnpm', [
    'exec', 'playwright', 'test',
    '--config=e2e/playwright.config.ts',
    'e2e/specs/guard.spec.ts'
  ], { cwd: 'apps/pwa' });
  expect(status).toBe(1); // child fails → guard catches undeclared error
});
```
```ts
// guard.spec.ts (playwright child runner — intentionally triggers CSP error)
test('fails undeclared CSP violations', async ({ page }) => {
  await page.evaluate(() => console.error('Content Security Policy violation'));
});
```
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec vitest run e2e/support/failure-guard.test.ts` (unit fails — guard not impl) and `pnpm --dir apps/pwa exec vitest run e2e/support/guard-runner.test.ts` (parent fails — child spec missing or guard not impl).
- [ ] **Step 3: Implement** projects `functional-mobile` (390x844, SW block), `functional-desktop` (1440x900), `pwa-runtime` (allow, serial), optional production smoke; Playwright config targeting `http://127.0.0.1:3000` with `testIgnore: ['**/guard.spec.ts']` so the intentionally-failing child spec is excluded from normal `testMatch`; fixture reset/header/storage/IndexedDB/cache/SW cleanup; `allowFailure({status?,url?,message?,reason})`.
- [ ] **Step 4: GREEN** — `pnpm --dir apps/pwa exec vitest run e2e/support/failure-guard.test.ts` (unit passes); `pnpm --dir apps/pwa exec vitest run e2e/support/guard-runner.test.ts` (parent passes because child exits 1 as expected); expected declared 422 passes; undeclared console/page/CSP/chunk/request/HTTP failure fails.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/playwright.config.ts apps/pwa/e2e/fixtures/app.ts apps/pwa/e2e/support/failure-guard.ts apps/pwa/e2e/support/failure-guard.test.ts apps/pwa/e2e/support/guard-runner.test.ts apps/pwa/e2e/support/reset.ts apps/pwa/e2e/specs/guard.spec.ts apps/pwa/package.json && git commit -m "test: add deterministic pwa playwright foundation"`.

### Task 4: Auth, direct-load and navigation IDs

**Files:** Create `apps/pwa/e2e/specs/auth.spec.ts`, `apps/pwa/e2e/specs/navigation.spec.ts`.

- [ ] **Step 1: RED** implement tests for `AUTH-01`, `AUTH-02`, `DIRECT-01..DIRECT-12` (direct load all 12 routes), `NAV-01..NAV-13` (client navigation), and exact BottomNav/More button clicks.
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts e2e/specs/auth.spec.ts e2e/specs/navigation.spec.ts`.
- [ ] **Step 3: Implement only required accessibility labels/test IDs** where semantic button names are absent; no behavior refactor.
- [ ] **Step 4: GREEN** assert URLs, fixture journal, styled shell, and zero guard failures.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/specs/auth.spec.ts apps/pwa/e2e/specs/navigation.spec.ts && git commit -m "test: cover pwa auth, direct-load and navigation e2e"`.

### Task 5: Transaction, home, records

**Files:** Create `transaction-sheet.spec.ts`, `home.spec.ts`, `records.spec.ts` under `apps/pwa/e2e/specs/`.

- [ ] **Step 1: RED** encode `TX-01..TX-09`, `HOME-01..HOME-10`, `REC-01..REC-06` as role-driven flows; assert exact journal calls such as `POST /transactions/expense`, `POST /transfers`, `PATCH /transactions/:id`, `DELETE /transactions/:id`.
- [ ] **Step 2: Run RED** — focused Playwright command for the three specs.
- [ ] **Step 3: Implement fixture seed/handlers and minimal labels only.**
- [ ] **Step 4: GREEN** cover cancel, validation, 422 and 500 state preservation/retry.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/specs/transaction-sheet.spec.ts apps/pwa/e2e/specs/home.spec.ts apps/pwa/e2e/specs/records.spec.ts && git commit -m "test: cover transaction home and records e2e"`.

### Task 6: Accounts through cards

**Files:** Create `accounts.spec.ts`, `categories.spec.ts`, `payables.spec.ts`, `budgets.spec.ts`, `goals.spec.ts`, `cards.spec.ts`.

- [ ] **Step 1: RED** implement atomic IDs `ACC-01..06`, `CAT-01..05`, `PAY-01..06`, `BUD-01..04`, `GOAL-01..06`, `CARD-01..08`.
- [ ] **Step 2: Run RED** — focused six-spec command.
- [ ] **Step 3: Implement fixture mutations** for accounts/cards/categories/payables/budgets/goals/statements/purchases; verify journal payloads and rendered totals/statuses.
- [ ] **Step 4: GREEN** each write has validation, cancel, and declared API-error assertion.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/specs/accounts.spec.ts apps/pwa/e2e/specs/categories.spec.ts apps/pwa/e2e/specs/payables.spec.ts apps/pwa/e2e/specs/budgets.spec.ts apps/pwa/e2e/specs/goals.spec.ts apps/pwa/e2e/specs/cards.spec.ts && git commit -m "test: cover pwa financial feature e2e"`.

### Task 7: Remaining features and shared UI

**Files:** Create `subscriptions.spec.ts`, `wallet.spec.ts`, `reports.spec.ts`, `profile.spec.ts`, `shared-ui.spec.ts`.

- [ ] **Step 1: RED** implement `SUB-01..05`, `WAL-01`, `REP-01`, `PROF-01..06`, `UI-01..08`.
- [ ] **Step 2: Run RED** — focused five-spec command.
- [ ] **Step 3: Implement fixture support and minimal labels** for notification dismiss/navigation, profile variants, stale/write-error banners and confirm dialog actions.
- [ ] **Step 4: GREEN** assert empty/degraded, cancel and retry branches.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/specs/subscriptions.spec.ts apps/pwa/e2e/specs/wallet.spec.ts apps/pwa/e2e/specs/reports.spec.ts apps/pwa/e2e/specs/profile.spec.ts apps/pwa/e2e/specs/shared-ui.spec.ts && git commit -m "test: cover remaining pwa e2e surfaces"`.

### Task 8: PWA stale-cache regression and coordinator

**Files:** Modify `apps/pwa/src/sw.ts`, `apps/pwa/src/components/RootProviders.tsx`, `apps/pwa/src/lib/sw-coordinator.tsx`; create/modify `apps/pwa/e2e/specs/pwa-runtime.spec.ts`, `apps/pwa/src/sw-runtime.test.ts`, `apps/pwa/src/lib/sw-coordinator.test.tsx`.

- [ ] **Step 1: RED** write PWA tests for `PWA-01..05`. Use a two-version harness: seed legacy cache entries (`pi-finance-shell`) via `page.evaluate` and serve the legacy SW from a separate build artifact, then trigger an update flow:
```ts
test('never caches route HTML and removes legacy shell cache', async ({ page }) => {
  await seedLegacyShell(page, '/registros');
  await activateUpdatedWorker(page);
  expect(await cacheEntries(page, 'pi-finance-shell')).toEqual([]);
  await expect(page.getByRole('button', { name: 'Registros' })).toBeEnabled();
});
test('clean form activates waiting worker once', async ({ page }) => {
  await loadCoordinator(page);
  await installLegacyWorker(page);
  await triggerUpdateAndActivate(page, { hasUnsavedChanges: false });
  await expect(page.getByText('CLEAN_UPDATE')).toBeVisible();
});
test('dirty form retains waiting worker without activation', async ({ page }) => {
  await loadCoordinator(page);
  await installLegacyWorker(page);
  await triggerUpdate(page, { hasUnsavedChanges: true });
  await expect(page.getByText('UPDATE_AVAILABLE')).toBeVisible();
  expect(await isWorkerActivated(page)).toBe(false);
});
```
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts --project=pwa-runtime e2e/specs/pwa-runtime.spec.ts`.
- [ ] **Step 3: Implement** network-only navigation plus precached offline-shell fallback; delete legacy `pi-finance-shell` on activate; never cache HTML/RSC. The coordinator is a React component mounted inside `UnsavedChangesProvider`; on boot it calls `navigator.serviceWorker.register('/sw.js')` and observes the `updatefound` event. When `registration.waiting` is detected (waiting worker exists), the coordinator checks `UnsavedChangesProvider` for dirty state: if clean, it dispatches a `CLEAN_UPDATE` message to the waiting worker, calls `registration.waiting.postMessage({type:'CLEAN_UPDATE'})`, then reloads the page once. If dirty (unsaved changes present), it retains the waiting worker without activation — no message sent, no reload. The coordinator null-checks `registration.waiting` before accessing it. The two-version harness must:
  - Serve the legacy SW from a separate build artifact (never from CacheStorage; a service worker cannot be loaded from cache)
  - Serve the updated SW via the production build
  - Control registration sequence for observable `statechange` cycle
- [ ] **Step 4: GREEN** runtime test proves no old chunk request/404, no HTML/RSC cache, offline fallback only after abort, clean/dirty update behavior with controlled two-version harness.
- [ ] **Step 5: Commit** `git add apps/pwa/src/sw.ts apps/pwa/src/components/RootProviders.tsx apps/pwa/src/lib/sw-coordinator.tsx apps/pwa/e2e/specs/pwa-runtime.spec.ts apps/pwa/src/sw-runtime.test.ts apps/pwa/src/lib/sw-coordinator.test.tsx && git commit -m "fix: harden pwa cache migration and updates"`.

### Task 9: Desktop, smoke and matrix enforcement

**Files:** Create `apps/pwa/e2e/specs/production-smoke.spec.ts`, `apps/pwa/e2e/support/matrix.ts`, `apps/pwa/e2e/support/matrix.test.ts`.

- [ ] **Step 1: RED** assert every matrix ID has an owning spec and production smoke refuses writes/registration (validates unauthenticated shell, no registration/write) unless `E2E_PRODUCTION_SMOKE=1`.
- [ ] **Step 2: Run RED** — Vitest matrix test and desktop/smoke Playwright commands.
- [ ] **Step 3: Implement** matrix manifest mapping IDs to spec files, desktop representative flows, explicit production read-only guard.
- [ ] **Step 4: GREEN** all IDs resolve and smoke is skipped by default.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/specs/production-smoke.spec.ts apps/pwa/e2e/support/matrix.ts apps/pwa/e2e/support/matrix.test.ts && git commit -m "test: enforce pwa e2e coverage matrix"`.

### Task 10: Separate CI E2E job

**Files:** Modify `.github/workflows/pwa-ci.yml`; create `apps/pwa/e2e/README.md`.

- [ ] **Step 1: RED** add CI-local reproduction script that expects `pwa-e2e` job/artifact configuration; run workflow YAML validation if available.
- [ ] **Step 2: Implement** job `pwa-e2e`, 25-minute timeout, build PWA with `NEXT_PUBLIC_PI_FINANCE_API_BASE_URL=http://127.0.0.1:4010`, start fixture API on 4010 and PWA on 3000, readiness checks for both, followed by mobile/desktop/runtime commands with `--workers=1 --retries=0`, failure artifact upload, opt-in production smoke with `workflow_dispatch` input and explicit URL. Teardown: stop fixture API, stop PWA process, clean test artifacts.
- [ ] **Step 3: GREEN** run the exact local command sequence (build + start + readiness + test + teardown) and inspect generated `test-results`.
- [ ] **Step 4: Commit** `git add .github/workflows/pwa-ci.yml apps/pwa/e2e/README.md && git commit -m "ci: run comprehensive pwa e2e separately"`.

### Task 11: Final verification

**Files:** Modify coverage matrix only if action IDs changed.

- [ ] **Step 1:** `pnpm --dir apps/pwa lint` → exit 0.
- [ ] **Step 2:** `pnpm --dir apps/pwa exec vitest run --coverage` → thresholds pass.
- [ ] **Step 3:** `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts --workers=1 --retries=0` twice consecutively → both exit 0.
- [ ] **Step 4:** `pnpm --dir apps/pwa build:cloudflare` and Wrangler local E2E runtime check → exit 0.
- [ ] **Step 5:** validate all action IDs map to a test; `git diff --check`; `! git grep -nE 'git commit -a(m| )' docs/` (no output = pass); request read-only review.
- [ ] **Step 6: Commit** `git add docs/testing/pwa-e2e-coverage-matrix.md && git commit -m "test: finalize pwa comprehensive e2e coverage"` if verification changes tracked files.

## Plan self-review
- Spec coverage: Tasks 1–10 map fixture protocol, all action IDs, PWA migration, CI and smoke requirements.
- Placeholder scan: no TODO/TBD/implicit feature groups.
- Consistency: fixture port 4010 (127.0.0.1), PWA port 3000 (127.0.0.1), test header `X-E2E-Test-ID`, and project names are fixed across tasks.
