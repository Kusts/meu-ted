# Strict PWA audit acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task.

**Goal:** Replace the PWA audit's all-or-nothing result with strict, expiring acceptance of exactly documented current vulnerability records.

**Architecture:** Keep `scripts/pwa-audit.mjs` responsible for producing scoped npm-audit data. Add a pure policy module that validates normalized records and allowlist metadata, then returns `PASS`, `ACCEPTED`, `RESOLVED`, or `BLOCKED`. No package override, patch, suppression, VPS/API change, push, or deploy is included.

**Tech Stack:** Node ESM, `node:test`, npm audit JSON, pnpm 9, GitHub Actions.

**Agent Orchestration:** Single-Agent Looped — policy, fixture, allowlist, and integration share one exact output contract.

---

## Files

- Create: `scripts/pwa-audit-policy.mjs` — pure validation, normalization, matching, expiry, reporting.
- Create: `scripts/pwa-audit-policy.test.mjs` — Node policy contracts.
- Create: `scripts/__fixtures__/pwa-audit-current.json` — sanitized current audit fixture.
- Create: `scripts/pwa-audit-allowlist.json` — exact accepted records and metadata.
- Modify: `scripts/pwa-audit.mjs` — call policy and preserve fail-closed audit acquisition.
- Create: `docs/security/pwa-audit-risk-acceptance.md` — scope-separated accepted risk report.
- Modify: `.github/workflows/pwa-ci.yml` — watch `scripts/pwa-audit*` and run policy tests.
- Modify: `apps/pwa/src/__tests__/pwa-ci-workflow.test.ts` — assert CI trigger/test contract.

### Task 1: Capture deterministic policy input

- [ ] **Step 1: Capture raw scoped audit JSON**

Run the existing isolated npm audit command, save only JSON to `scripts/__fixtures__/pwa-audit-current.json`, and remove temp paths/timestamps. Do not edit advisory values.

Expected: fixture parses with `JSON.parse` and contains the current 18 vulnerability records.

- [ ] **Step 2: Add fixture integrity test**

Create `scripts/pwa-audit-policy.test.mjs`:
```js
import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './__fixtures__/pwa-audit-current.json' with { type: 'json' };

test('current fixture contains vulnerability records', () => {
  assert.ok(Object.keys(fixture.vulnerabilities).length > 0);
});
```

Run `node --test scripts/pwa-audit-policy.test.mjs`; expected FAIL before fixture exists, then PASS after capture.

- [ ] **Step 3: Commit fixture contract**

```bash
git add scripts/__fixtures__/pwa-audit-current.json scripts/pwa-audit-policy.test.mjs
git commit -m "test: capture PWA audit policy fixture"
```

### Task 2: Implement strict policy in TDD increments

- [ ] **Step 1: Write failing policy tests**

Add tests requiring exported `evaluateAudit({ audit, allowlist, today })` to return:
```js
assert.equal(result.status, 'ACCEPTED');
assert.equal(result.blocked.length, 0);
```
Add separate fixtures/assertions for a new record, changed `via`, expired `expiresOn: '2026-08-25'`, malformed allowlist entry, and absent formerly accepted record. Expected: all fail before module exists.

- [ ] **Step 2: Implement minimal pure module**

Create `scripts/pwa-audit-policy.mjs` with exports:
```js
export function normalizeAudit(audit) { /* sorted package/via/effects/range/chains */ }
export function validateAllowlist(allowlist) { /* require id, exact record, scope, owner, justification, expiresOn */ }
export function evaluateAudit({ audit, allowlist, today }) { /* PASS|ACCEPTED|BLOCKED + RESOLVED */ }
```
Reject wildcard, package-only, missing range/chain, invalid UTC `YYYY-MM-DD`, and expired entries. Compare canonical JSON of every required record field; derive scope using runtime > build-time > dev-only.

- [ ] **Step 3: Verify red-green behavior**

Run:
```bash
node --test scripts/pwa-audit-policy.test.mjs
```
Expected: accepted/resolved cases pass; new/changed/expired/malformed cases return `BLOCKED`.

- [ ] **Step 4: Commit**

```bash
git add scripts/pwa-audit-policy.mjs scripts/pwa-audit-policy.test.mjs
git commit -m "feat: add strict PWA audit policy"
```

Rollback: `git revert HEAD`.

### Task 3: Allowlist and human risk report

- [ ] **Step 1: Create exact allowlist**

Create `scripts/pwa-audit-allowlist.json` from normalized fixture records. Every entry includes exact record fields plus:
```json
{
  "id": "pwa-2026-07-26-<package>",
  "scope": "runtime|build-time|dev-only",
  "owner": "project-maintainer",
  "justification": "No compatible upstream release as of 2026-07-26.",
  "expiresOn": "2026-08-26"
}
```
No wildcard, package-only, version-range-only, or severity-only entry is permitted.

- [ ] **Step 2: Create risk report**

Create `docs/security/pwa-audit-risk-acceptance.md` grouping exact allowlist IDs under runtime, build-time, and dev-only; include owner, expiry, mitigation (upstream monitoring), and review date.

- [ ] **Step 3: Verify exact current match**

Run:
```bash
node --test scripts/pwa-audit-policy.test.mjs
```
Expected: current fixture produces `ACCEPTED`, not `PASS`; deleting/changing one identity field produces `BLOCKED`.

- [ ] **Step 4: Commit**

```bash
git add scripts/pwa-audit-allowlist.json docs/security/pwa-audit-risk-acceptance.md scripts/pwa-audit-policy.test.mjs
git commit -m "docs: accept current PWA audit risks"
```

Rollback: `git revert HEAD`.

### Task 4: Integrate the policy and protect CI

- [ ] **Step 1: Write failing workflow test**

Extend `apps/pwa/src/__tests__/pwa-ci-workflow.test.ts`:
```ts
expect(workflow).toContain('"scripts/pwa-audit*"');
expect(workflow).toContain('node --test scripts/pwa-audit-policy.test.mjs');
```
Run the focused Vitest test; expected FAIL.

- [ ] **Step 2: Integrate policy minimally**

Modify `scripts/pwa-audit.mjs` after audit JSON parsing to import the policy and allowlist, call `evaluateAudit({ audit: parsed, allowlist, today: new Date().toISOString().slice(0, 10) })`, print each `ACCEPTED`/`RESOLVED`/`BLOCKED` line, and exit according to policy. Keep acquisition errors fail-closed.

- [ ] **Step 3: Update CI paths and test**

Replace the single audit-script path filters with:
```yaml
- "scripts/pwa-audit*"
```
Add before scoped audit:
```yaml
- name: Test PWA audit policy
  run: node --test scripts/pwa-audit-policy.test.mjs
```

- [ ] **Step 4: Verify integration**

Run:
```bash
node --test scripts/pwa-audit-policy.test.mjs
node scripts/pwa-audit.mjs
pnpm --dir apps/pwa exec vitest run src/__tests__/pwa-ci-workflow.test.ts
```
Expected: policy tests pass; current audit prints `ACCEPTED` and exits 0; workflow test passes.

- [ ] **Step 5: Commit**

```bash
git add scripts/pwa-audit.mjs scripts/pwa-audit-policy.mjs scripts/pwa-audit-allowlist.json .github/workflows/pwa-ci.yml apps/pwa/src/__tests__/pwa-ci-workflow.test.ts
git commit -m "feat: enforce strict PWA audit acceptance"
```

Rollback: `git revert HEAD`.

### Task 5: Release-quality verification and source publication

- [ ] **Step 1: Linux reproducibility**

In clean Docker Node 20/pnpm 9:
```bash
pnpm install --frozen-lockfile
node --test scripts/pwa-audit-policy.test.mjs
node scripts/pwa-audit.mjs
pnpm --dir apps/pwa lint
pnpm --dir apps/pwa build:cloudflare
```
Expected: frozen install, policy, accepted audit, lint, and OpenNext build all exit 0.

- [ ] **Step 2: PWA quality gates**

Run:
```bash
pnpm --dir apps/pwa exec vitest run
pnpm --dir apps/pwa exec vitest run src/headers.test.ts
pnpm --dir apps/pwa exec lhci autorun
CI=1 pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts --project=functional-mobile
pnpm --dir apps/pwa exec playwright test --config=scripts/offline-shell-spike/playwright.config.ts
git diff --check
```
Expected: all exit 0.

- [ ] **Step 3: Security review and push**

Review that allowlist matching has no wildcard/package-only bypass, expiry uses UTC, malformed input fails closed, accepted runtime risk is documented, and no override/patch/VPS/API diff exists. Commit only verified residual changes, then `git push origin main`. Require PWA CI green.

- [ ] **Step 4: Stop before deployment**

Do not deploy. Request fresh explicit authorization only after PWA CI is green.
