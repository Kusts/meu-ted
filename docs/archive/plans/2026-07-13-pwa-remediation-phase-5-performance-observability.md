# PWA Remediation Phase 5: Performance + Observability

**Goal:** cache static assets safely, measure UX and log only sanitized operational signals.

### Task 5.1: Cloudflare Assets headers proof

**Requirements:** R-11,R-12.  
**Files:** Create `apps/pwa/public/_headers` prototype, header tests; Modify `wrangler.jsonc`/build verification.

- [ ] RED test builds OpenNext and asserts `.open-next/assets/_headers` exists with immutable `_next/static` rule, private HTML rule and no API rule.
- [ ] Verify rather than assume `_headers` propagates through OpenNext Assets binding. If absent, implement equivalent Worker asset response header transform and test it.
- [ ] GREEN build/header contract: hashed CSS/JS `public,max-age=31536000,immutable`; HTML `private,no-store`.
- [ ] Rollback: remove only immutable transform; API stays uncached.

### Task 5.2: Sanitized RUM and Lighthouse

**Requirements:** R-13.  
**Files:** Create `src/lib/observability/web-vitals.ts`, tests, `lighthouserc.cjs`; Modify package/CI.

- [ ] RED sanitizer tests reject token, household ID, financial value and query string; allow metric/value/normalized route/buildId.
- [ ] Implement event emitter behind feature flag; Worker/OpenNext logs aggregate failures only.
- [ ] Install `@lhci/cli`; configure mobile thresholds Performance ≥90, A11y ≥95, CLS ≤0.1, LCP ≤2.5s, TBT ≤200ms; initial route ≤200 KB gzip, bundle regression ≤5%.
- [ ] GREEN RUM tests, Lighthouse CI, scoped PWA audit.
- [ ] Rollback: disable RUM flag; revert asset transform independently.
- [ ] Commit after green: `git add apps/pwa .github/workflows && git commit -m "perf: measure and cache pwa safely"`.

| Phase acceptance | Rollback |
|---|---|
| Asset headers immutable, RUM sanitized, Lighthouse and scoped audit green | Disable RUM flag; revert asset-header commit without touching API cache policy |
