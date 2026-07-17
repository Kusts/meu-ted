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
- [ ] **Step 3: Implement** scoped `Map<string, TestStore>`, fixed clock `2026-07-17T12:00:00.000Z`, endpoints `/__e2e/reset`, `/__e2e/scenario`, `/__e2e/journal`, `/__e2e/seed`, required `X-E2E-Test-ID`, localhost-only CORS, and journal `{method,path,body,status}`.
- [ ] **Step 4: GREEN** — same command passes; add tests for missing test ID 400, delay/401/422/500/abort scenario.
- [ ] **Step 5: Commit** `git add apps/pwa/e2e/fixture-api && git commit -m "test: add scoped pwa e2e fixture api"`.

### Task 2: Endpoint compatibility

**Files:** Modify `apps/pwa/e2e/fixture-api/server.ts`; test `apps/pwa/e2e/fixture-api/contracts.test.ts`.

- [ ] **Step 1: RED** assert every endpoint exported by `src/lib/api/endpoints.ts` returns its contract:
```ts
it.each(['/accounts','/categories','/transactions','/payables','/budgets','/goals','/cards/accounts','/cards/statements','/subscriptions','/profile','/insights/quick'])('%s has production shape', async path => {
  expect(await get(path)).toMatchObject({ items: expect.any(Array) });
});
```
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec vitest run e2e/fixture-api/contracts.test.ts`.
- [ ] **Step 3: Implement** list `{items,total}`, transactions `{items,total}`, profile `{profile}`, auth register/me, and all create/update/delete/pay/cancel routes named in the matrix; mutate only the test-scoped store.
- [ ] **Step 4: GREEN** — command passes and journal asserts method/body for each mutation.
- [ ] **Step 5: Commit** `git commit -am "test: cover pwa fixture endpoint contracts"`.

### Task 3: Playwright foundation and guard

**Files:** Create `apps/pwa/e2e/playwright.config.ts`, `apps/pwa/e2e/fixtures/app.ts`, `apps/pwa/e2e/support/failure-guard.ts`, `apps/pwa/e2e/support/reset.ts`, `apps/pwa/e2e/specs/guard.spec.ts`; modify `apps/pwa/package.json`.

- [ ] **Step 1: RED**
```ts
test('fails undeclared CSP violations', async ({ guardedPage }) => {
  await guardedPage.evaluate(() => console.error('Content Security Policy violation'));
});
```
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts e2e/specs/guard.spec.ts`; expect guard failure.
- [ ] **Step 3: Implement** projects `functional-mobile` (390x844, SW block), `functional-desktop` (1440x900), `pwa-runtime` (allow, serial), optional production smoke; fixture reset/header/storage/IndexedDB/cache/SW cleanup; `allowFailure({status?,url?,message?,reason})`.
- [ ] **Step 4: GREEN** — expected declared 422 passes; undeclared console/page/CSP/chunk/request/HTTP failure fails.
- [ ] **Step 5: Commit** `git commit -am "test: add deterministic pwa playwright foundation"`.

### Task 4: Auth and all navigation IDs

**Files:** Create `apps/pwa/e2e/specs/auth.spec.ts`, `apps/pwa/e2e/specs/navigation.spec.ts`.

- [ ] **Step 1: RED** implement tests for `AUTH-01`, `AUTH-02`, `NAV-01..NAV-12`, direct load of all 12 routes, and exact BottomNav/More button clicks.
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts e2e/specs/auth.spec.ts e2e/specs/navigation.spec.ts`.
- [ ] **Step 3: Implement only required accessibility labels/test IDs** where semantic button names are absent; no behavior refactor.
- [ ] **Step 4: GREEN** assert URLs, fixture journal, styled shell, and zero guard failures.
- [ ] **Step 5: Commit** `git commit -am "test: cover pwa auth and navigation e2e"`.

### Task 5: Transaction, home, records

**Files:** Create `transaction-sheet.spec.ts`, `home.spec.ts`, `records.spec.ts` under `apps/pwa/e2e/specs/`.

- [ ] **Step 1: RED** encode `TX-01..TX-06`, `HOME-01..HOME-04`, `REC-01..REC-03` as role-driven flows; assert exact journal calls such as `POST /transactions/expense`, `POST /transfers`, `PATCH /transactions/:id`, `DELETE /transactions/:id`.
- [ ] **Step 2: Run RED** — focused Playwright command for the three specs.
- [ ] **Step 3: Implement fixture seed/handlers and minimal labels only.**
- [ ] **Step 4: GREEN** cover cancel, validation, 422 and 500 state preservation/retry.
- [ ] **Step 5: Commit** `git commit -am "test: cover transaction home and records e2e"`.

### Task 6: Accounts through cards

**Files:** Create `accounts.spec.ts`, `categories.spec.ts`, `payables.spec.ts`, `budgets.spec.ts`, `goals.spec.ts`, `cards.spec.ts`.

- [ ] **Step 1: RED** implement atomic IDs `ACC-01..04`, `CAT-01..02`, `PAY-01..03`, `BUD-01..02`, `GOAL-01..02`, `CARD-01..03`.
- [ ] **Step 2: Run RED** — focused six-spec command.
- [ ] **Step 3: Implement fixture mutations** for accounts/cards/categories/payables/budgets/goals/statements/purchases; verify journal payloads and rendered totals/statuses.
- [ ] **Step 4: GREEN** each write has validation, cancel, and declared API-error assertion.
- [ ] **Step 5: Commit** `git commit -am "test: cover pwa financial feature e2e"`.

### Task 7: Remaining features and shared UI

**Files:** Create `subscriptions.spec.ts`, `wallet.spec.ts`, `reports.spec.ts`, `profile.spec.ts`, `shared-ui.spec.ts`.

- [ ] **Step 1: RED** implement `SUB-01..02`, `WAL-01`, `REP-01`, `PROF-01..03`, `UI-01..02`.
- [ ] **Step 2: Run RED** — focused five-spec command.
- [ ] **Step 3: Implement fixture support and minimal labels** for notification dismiss/navigation, profile variants, stale/write-error banners and confirm dialog actions.
- [ ] **Step 4: GREEN** assert empty/degraded, cancel and retry branches.
- [ ] **Step 5: Commit** `git commit -am "test: cover remaining pwa e2e surfaces"`.

### Task 8: PWA stale-cache regression and coordinator

**Files:** Modify `apps/pwa/src/sw.ts`, `apps/pwa/src/components/RootProviders.tsx`, `apps/pwa/src/lib/sw-coordinator.tsx`; create/modify `apps/pwa/e2e/specs/pwa-runtime.spec.ts`, `apps/pwa/src/sw-runtime.test.ts`, `apps/pwa/src/lib/sw-coordinator.test.tsx`.

- [ ] **Step 1: RED** write PWA tests for `PWA-01..03`:
```ts
test('never caches route HTML and removes legacy shell cache', async ({ page }) => {
  await seedLegacyShell(page, '/registros');
  await activateUpdatedWorker(page);
  expect(await cacheEntries(page, 'pi-finance-shell')).toEqual([]);
  await expect(page.getByRole('button', { name: 'Registros' })).toBeEnabled();
});
```
- [ ] **Step 2: Run RED** — `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts --project=pwa-runtime e2e/specs/pwa-runtime.spec.ts`.
- [ ] **Step 3: Implement** network-only navigation plus precached offline-shell fallback; delete legacy `pi-finance-shell` on activate; never cache HTML/RSC; mount coordinator under `UnsavedChangesProvider`; null-check waiting worker; clean sends `CLEAN_UPDATE` then reloads once, dirty retains waiting worker.
- [ ] **Step 4: GREEN** runtime test proves no old chunk request/404, no HTML/RSC cache, offline fallback only after abort, and clean/dirty update behavior.
- [ ] **Step 5: Commit** `git commit -am "fix: harden pwa cache migration and updates"`.

### Task 9: Desktop, smoke and matrix enforcement

**Files:** Create `apps/pwa/e2e/specs/production-smoke.spec.ts`, `apps/pwa/e2e/support/matrix.ts`, `apps/pwa/e2e/support/matrix.test.ts`.

- [ ] **Step 1: RED** assert every matrix ID has an owning spec and production smoke refuses writes/registration unless `E2E_PRODUCTION_SMOKE=1`.
- [ ] **Step 2: Run RED** — Vitest matrix test and desktop/smoke Playwright commands.
- [ ] **Step 3: Implement** matrix manifest mapping IDs to spec files, desktop representative flows, explicit production read-only guard.
- [ ] **Step 4: GREEN** all IDs resolve and smoke is skipped by default.
- [ ] **Step 5: Commit** `git commit -am "test: enforce pwa e2e coverage matrix"`.

### Task 10: Separate CI E2E job

**Files:** Modify `.github/workflows/pwa-ci.yml`; create `apps/pwa/e2e/README.md`.

- [ ] **Step 1: RED** add CI-local reproduction script that expects `pwa-e2e` job/artifact configuration; run workflow YAML validation if available.
- [ ] **Step 2: Implement** job `pwa-e2e`, 25-minute timeout, ports 4010/3000, Chromium install, mobile/desktop/runtime commands with `--workers=1 --retries=1`, failure artifact upload, opt-in production smoke workflow_dispatch input.
- [ ] **Step 3: GREEN** run the exact local command sequence and inspect generated `test-results`.
- [ ] **Step 4: Commit** `git commit -am "ci: run comprehensive pwa e2e separately"`.

### Task 11: Final verification

**Files:** Modify coverage matrix only if action IDs changed.

- [ ] **Step 1:** `pnpm --dir apps/pwa lint` → exit 0.
- [ ] **Step 2:** `pnpm --dir apps/pwa exec vitest run --coverage` → thresholds pass.
- [ ] **Step 3:** `pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts --workers=1` twice → both exit 0.
- [ ] **Step 4:** `pnpm --dir apps/pwa build:cloudflare` and Wrangler local E2E runtime check → exit 0.
- [ ] **Step 5:** validate all action IDs map to a test; `git diff --check`; request read-only review.
- [ ] **Step 6: Commit** `git commit -am "test: finalize pwa comprehensive e2e coverage"` if verification changes tracked files.

## Plan self-review
- Spec coverage: Tasks 1–10 map fixture protocol, all action IDs, PWA migration, CI and smoke requirements.
- Placeholder scan: no TODO/TBD/implicit feature groups.
- Consistency: fixture port 4010, PWA port 3000, test header `X-E2E-Test-ID`, and project names are fixed across tasks.
