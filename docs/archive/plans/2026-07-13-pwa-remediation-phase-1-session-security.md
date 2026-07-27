# PWA Remediation Phase 1: Session + Security

**Goal:** clear sensitive client data reliably and harden online Worker responses.

### Task 1.1: Current session cleanup

**Requirements:** R-01.  
**Files:** Create `apps/pwa/src/lib/session.ts`, `session.test.ts`; Modify `reset-session.ts`, `ProfilePage.tsx`, `AuthGate.tsx`.

- [ ] RED test seeds token, v1 snapshot and profile; invokes `clearSensitiveSession`; expects each sensitive key removed and no Cache Storage deletion.
- [ ] Run `pnpm --dir apps/pwa exec vitest run src/lib/session.test.ts`; expected RED module missing.
- [ ] Implement `clearSensitiveSession({clearToken,clearV1Snapshot,clearProfile,clearMemory})` as async/idempotent.
- [ ] Route logout and 401 expiry through it before UI transition.
- [ ] GREEN focused + AuthGate/Profile tests.
- [ ] Rollback: static app-shell caches intentionally remain; v2 cleanup is added in Phase 2.

### Task 1.2: Remove public token and fix mock boot

**Requirements:** R-02,R-14.  
**Files:** Modify `src/lib/api/client.ts`, `client.test.ts`, `RootProviders.tsx`, `AuthGate.test.tsx`, `README.md`.

- [ ] RED client test sets `NEXT_PUBLIC_PI_FINANCE_API_DEVICE_TOKEN`; expects no token header.
- [ ] RED provider test without API env; expects mock UI and no `/auth/devices/register` request.
- [ ] Remove public env token branch; make unconfigured `RootProviders` bypass `AuthGate` into mock provider.
- [ ] Update README: PIN intentionally removed, local token is JS-accessible, mock mode exact behavior.
- [ ] GREEN `pnpm --dir apps/pwa exec vitest run src/lib/api/client.test.ts src/features/auth/__tests__/AuthGate.test.tsx`.

### Task 1.3: Next 16 proxy CSP and contracts

**Requirements:** R-11,R-15.  
**Files:** Create `apps/pwa/src/proxy.ts`, proxy tests, HTTP contract script; Modify `next.config.ts`, CI.

- [ ] RED proxy test expects unique nonce, HSTS, nosniff, referrer, permissions, frame-ancestors; expects `connect-src` API and temporary inline style allowance.
- [ ] Implement Next 16 `proxy.ts`; set nonce on request/response; set `poweredByHeader:false`.
- [ ] Verify `pnpm --dir apps/pwa build:cloudflare`; expected build succeeds under OpenNext.
- [ ] Contract test canonical API origin returns ACAO; hostile origin lacks ACAO.
- [ ] GREEN unit/contract tests. Rollback: revert `proxy.ts` and headers atomically if OpenNext incompatibility appears.
- [ ] Acceptance/checkpoint: deployed passive `curl -I /` has headers; no nonce HTML enters SW precache.
- [ ] Commit after green: `git add apps/pwa && git commit -m "feat: harden pwa session and headers"`.

| Phase acceptance | Rollback |
|---|---|
| Logout clears v1/session/profile; proxy build + CSP/CORS contracts green | Revert session/proxy commit together; server data and static caches remain |
