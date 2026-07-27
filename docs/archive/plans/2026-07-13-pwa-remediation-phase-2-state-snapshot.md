# PWA Remediation Phase 2: State + Snapshot

**Goal:** create testable sync/command seams and migrate data snapshots to token-free IndexedDB v2.

### Task 2.1: Reducer and sync engine

**Requirements:** R-05,R-06.  
**Files:** Create `src/lib/state/state-reducer.ts`, `sync-engine.ts`, tests; Modify `app-state-context.tsx`.

- [ ] RED reducer tests: live domain, snapshot fallback, unavailable, 401, read-only mutation rejection.
- [ ] Implement discriminated `domain/live|snapshot|unavailable` actions with pure state output.
- [ ] Move `Promise.allSettled` bootstrap into `sync-engine`; provider remains same public facade.
- [ ] GREEN reducer/sync tests plus provider suite.
- [ ] Checkpoint: public context contract unchanged; revert extraction only on regression.

### Task 2.2: IndexedDB v2 migration

**Requirements:** R-03,R-04.  
**Files:** Add `fake-indexeddb`, Stryker packages/config; Create `snapshot-db.ts`, tests; Modify `snapshot-store.ts`, `session.ts`.

- [ ] RED tests: valid v1 migration, mismatch, corrupt v1, interrupted transaction, v2 read/write/delete.
- [ ] Implement SHA-256 token fingerprint; transaction writes `{schema:2,ownerFingerprint,domains,syncedAt}`, rereads validation, then deletes v1 token envelope.
- [ ] On corrupt/schema/owner mismatch delete v2 and return no data, forcing online sync.
- [ ] Extend Phase-1 cleanup test to delete v2 too, never static caches.
- [ ] GREEN snapshot tests; `pnpm --dir apps/pwa exec stryker run`, expected snapshot ≥70%.
- [ ] Rollback: v1 stays until v2 verified; deleting v2 never changes server data.

### Task 2.3: Command boundary

**Requirements:** R-06.  
**Files:** Create `commands.ts`, tests; Modify provider.

- [ ] RED representative create/update/delete/pay tests: offline returns `OfflineWriteError`, makes no request or optimistic update.
- [ ] Implement `createCommands({online,token,dispatch,api})`; preserve idempotency argument unchanged.
- [ ] Replace transactions first, then cards/payables command wiring; green focused test after each family.
- [ ] GREEN full provider suite and commands mutation target ≥70%.
- [ ] Commit after green: `git add apps/pwa && git commit -m "refactor: isolate pwa snapshot sync and commands"`.

| Phase acceptance | Rollback |
|---|---|
| v1→v2 migration transactional; corrupt/mismatch snapshot discarded; commands offline-safe | Delete v2 or revert remediation commit; v1/server data remain intact |
