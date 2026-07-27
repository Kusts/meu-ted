# PWA Remediation Phase 4: Context Decomposition

**Goal:** reduce `AppStateProvider` to facade/composition while preserving its public contract.

### Task 4.1: Profile adapter

**Requirements:** R-05,R-06.  
**Files:** Create `src/lib/state/profile-adapter.ts`, tests; Modify provider.

- [ ] RED characterization: `saveProfile` changes expected public profile projection and preserves error semantics.
- [ ] Extract profile persistence/API projection into adapter injected by provider.
- [ ] GREEN provider/profile tests. Checkpoint: revert adapter extraction only.

### Task 4.2: Subscriptions/statements adapter

**Files:** Create `subscriptions-adapter.ts`, tests; Modify provider.

- [ ] RED characterization: subscription failure is nonessential; statement refresh does not break accounts state.
- [ ] Extract subscription/statement loading and refresh adapter.
- [ ] GREEN provider/cards/subscriptions tests. Rollback: restore adapter call site only.

### Task 4.3: Final command composition

**Files:** Modify provider, command adapters/tests.

- [ ] RED characterization: read-only command failure remains typed and no optimistic update occurs.
- [ ] Move remaining command wiring into `commands.ts` composition; provider imports interfaces only.
- [ ] GREEN full suite, coverage ≥80%, commands mutation ≥70%.
- [ ] Acceptance: provider is facade, not snapshot/sync/command implementation; no visual changes.
- [ ] Commit after green: `git add apps/pwa && git commit -m "refactor: split pwa state provider"`.

| Phase acceptance | Rollback |
|---|---|
| Provider facade contracts, coverage and mutation gates green | Revert last adapter extraction only; public facade remains |
