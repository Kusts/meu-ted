# PWA Remediation Phase 3: Offline + Service Worker

**Goal:** prove a safe offline shell, then add SW without caching financial API/RSC data.

### Task 3.1: Blocking offline-shell experiment

**Requirements:** R-05,R-07.  
**Files:** Create experiment under `apps/pwa/scripts/offline-shell-spike/`; no product SW files yet.

- [ ] Option A RED/proof: generate static route documents for all 12 routes; build OpenNext; direct offline load must render without RSC request.
- [ ] Option B RED/proof: dedicated external-script client bundle reads `location.pathname` + IndexedDB snapshot; emitted `offline-shell.html` plus JS must direct-load offline without RSC request.
- [ ] Run `pnpm --dir apps/pwa build:cloudflare`; inspect emitted files and compressed total ≤2 MB.
- [ ] PASS only if direct offline `/registros` works, renders stale/read-only and browser network log has no RSC/API request. FAIL: remove spike output, record result, stop phase for redesign.
- [ ] Recommendation: adopt dedicated bundle only after PASS. Checkpoint: spike branch/commit, never production SW.

### Task 3.2: Serwist compatibility proof

**Requirements:** R-07,R-12.  
**Files:** Modify package/config only after Task 3.1 PASS; Create `src/sw.ts`, `sw.test.ts`.

- [ ] RED matcher tests allow only same-origin navigation/static hashed assets; reject API, cross-origin, auth header, `/pwa-control`, `?_rsc=`.
- [ ] Install `@serwist/next@9.5.11 @serwist/cli@9.5.11`.
- [ ] Build Next + OpenNext; expected `/sw.js` emitted and Worker boot succeeds. If FAIL, remove Serwist config and use direct Workbox generated-worker prototype with same tests.
- [ ] Configure precache static `offline-shell.html` + external `offline-shell.js` and `_next/static`; navigation is network-first then shell. Offline shell uses static CSP/external scripts only; online nonce HTML is never precached.
- [ ] GREEN matcher tests; inspect Cache Storage: no API/RSC/auth/cross-origin entries.

### Task 3.3: Update, dirty state, kill switch and E2E

**Requirements:** R-08,R-09,R-10.  
**Files:** Create `UnsavedChangesContext.tsx`, coordinator/tests, `app/pwa-control/route.ts`; Modify forms/RootProviders; Create Playwright config/specs.

- [ ] RED tests: clean confirmation activates waiting SW; dirty form retains waiting SW; kill switch deletes only `pi-finance-*` caches.
- [ ] Group A dirty integration: NewTransaction, records, cards. Group B: payables, budgets, goals, subscriptions, profile.
- [ ] RED probe imports `getCloudflareContext` from `@opennextjs/cloudflare`, reads `env.PWA_SW_ENABLED`, and asserts `{ enabled: boolean }` plus `Cache-Control: no-store`; run OpenNext preview. Expected RED: import/binding shape differs.
- [ ] Implement route after probe passes:

```ts
const { env } = await getCloudflareContext();
return Response.json({ enabled: env.PWA_SW_ENABLED !== "false" }, {
  headers: { "Cache-Control": "no-store" },
});
```

- [ ] Page boot fetches `/pwa-control` with `{ cache: "no-store" }`; disabled value unregisters SW and deletes only cache names prefixed `pi-finance-`.
- [ ] Install `@playwright/test`; scripts `e2e`, `e2e:install`; test direct offline load/reload of all required routes, blocked mutation, clean/dirty update, kill switch.
- [ ] GREEN `pnpm --dir apps/pwa exec playwright test`; add job to CI.
- [ ] Rollback: control env enables unregister; never delete non-Pi caches.
- [ ] Commit after green: `git add apps/pwa && git commit -m "feat: add safe offline pwa shell"`.

| Phase acceptance | Rollback |
|---|---|
| Static external-script shell direct-loads required URL offline; SW has zero API/RSC/auth cache entries; update E2E green | Set `PWA_SW_ENABLED=false`; unregister and remove only `pi-finance-*` caches |
