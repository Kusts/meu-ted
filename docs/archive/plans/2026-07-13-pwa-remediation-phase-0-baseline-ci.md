# PWA Remediation Phase 0: Baseline + CI

**Goal:** isolate current bootstrap failure, eliminate lint debt, install reproducible PWA-only gates.

## Prerequisite

- [ ] In source checkout run `git status --short > ../pwa-wip-status.txt`.
- [ ] Create checkpoint branch/commit containing relevant PWA WIP, excluding `audit-*.mjs`, `pwa-*-audit/`, reports and temporary output.
- [ ] Create remediation worktree from checkpoint; record path/commit in handoff. Never reset/stash original checkout.

### Task 0.1: PWA audit classifier

**Files:** Create `scripts/check-pwa-audit.mjs`, `scripts/__tests__/check-pwa-audit.test.mjs`, JSON fixtures.

- [ ] RED fixture tests: direct `apps__pwa` advisory exits 1; transitive PWA dependency exits 1; sibling-only exits 0; unknown audit shape exits 1.
- [ ] Run `node --test scripts/__tests__/check-pwa-audit.test.mjs`; expected RED: module absent.
- [ ] Implement parser: consume `pnpm audit --json`; classify by dependency path; fail closed for unknown schema/path.
- [ ] GREEN same command; expected PASS 4 tests.
- [ ] Run `pnpm audit --json | node scripts/check-pwa-audit.mjs`; expected no block after Vite patch.
- [ ] Checkpoint/rollback: revert only `scripts/`; no lockfile change yet.

### Task 0.2: Upgrade PWA Vite

**Files:** Modify `apps/pwa/package.json`, `pnpm-lock.yaml`.

- [ ] RED `pnpm audit --json | node scripts/check-pwa-audit.mjs`; expected Vite GHSA-fx2h-pf6j-xcff block.
- [ ] Update resolution/direct tooling to Vite `>=7.3.5` without upgrading unrelated workspace packages.
- [ ] GREEN audit classifier; expected sibling advisories logged but exit 0.
- [ ] Run `pnpm --dir apps/pwa exec vitest run src/lib/api/client.test.ts`; expected PASS.
- [ ] Rollback: revert package/lock pair together.

### Task 0.3: Bootstrap timeout regression

**Files:** Modify `apps/pwa/src/lib/state/__tests__/app-state-context.test.tsx`; then minimal `app-state-context.tsx` lines causing failure.

- [ ] RED `pnpm --dir apps/pwa exec vitest run src/lib/state/__tests__/app-state-context.test.tsx -t "calls expireSession when a read returns 401"`; expected timeout.
- [ ] Add explicit assertion for settled bootstrap/loading state and mocked rejected request.
- [ ] Fix only promise settlement/cancellation/loading path; do not raise timeout or skip test.
- [ ] GREEN focused test, then named tests: essential failure, nonessential failure, snapshot read-only command.
- [ ] Run full provider test file; expected PASS.
- [ ] Rollback: revert only bootstrap fix; retained RED test identifies defect.

### Task 0.4: Lint by feature group + CI

**Files:** Modify lint offenders; Create `.github/workflows/pwa-ci.yml`.

- [ ] Group A RED/GREEN: accounts/categories/records/edit-sheet lint + focused tests.
- [ ] Group B RED/GREEN: budgets/cards/goals/subscriptions lint + focused tests.
- [ ] Group C RED/GREEN: profile/notifications/test fixtures/unused imports + focused tests.
- [ ] Add CI pinned to Node 20 and pnpm 9; run frozen install, `pnpm --dir apps/pwa lint`, `pnpm --dir apps/pwa exec vitest run`, build Cloudflare, audit classifier.
- [ ] Final: `pnpm --dir apps/pwa lint && pnpm --dir apps/pwa exec vitest run && pnpm --dir apps/pwa build:cloudflare && pnpm audit --json | node scripts/check-pwa-audit.mjs`.
- [ ] Acceptance: all exit 0; checkpoint commit only in remediation worktree.
- [ ] Commit after green: `git add apps/pwa scripts .github/workflows/pwa-ci.yml pnpm-lock.yaml && git commit -m "chore: establish pwa quality baseline"`.

| Phase acceptance | Rollback |
|---|---|
| CI executes pinned Node/pnpm, lint/unit/build/scoped-audit exit 0 | Revert remediation-worktree commit only; original WIP untouched |
