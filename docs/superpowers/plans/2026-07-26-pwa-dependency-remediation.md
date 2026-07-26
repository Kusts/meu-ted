# PWA dependency remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all PWA scoped-audit advisories with compatible upstream releases while preserving the Cloudflare Worker build.

**Architecture:** PWA direct dependencies are upgraded one compatible upstream unit at a time. Each unit must pass the scoped audit without increasing its advisory count and must build through OpenNext before proceeding. Root overrides and package patches are excluded because they previously broke OpenNext or legacy consumers.

**Tech Stack:** pnpm 9, Node 20, Next.js, OpenNext Cloudflare, ESLint, Lighthouse CI, Playwright, Vitest, GitHub Actions.

**Agent Orchestration:** Single-Agent Looped — each dependency increment changes shared manifest and lockfile state, so serial build/audit evidence is required.

---

## Files

- Modify: `.github/workflows/pwa-ci.yml` — trigger correct audit script changes.
- Create: `apps/pwa/src/__tests__/pwa-ci-workflow.test.ts` — prevent stale audit path regression.
- Modify: `apps/pwa/package.json` — direct compatible PWA upgrades only.
- Modify: `pnpm-lock.yaml` — pnpm 9-generated dependency resolution.
- Modify: `docs/superpowers/specs/2026-07-26-pwa-dependency-remediation-design.md` — only if an explicitly approved exception changes the design.

### Task 1: Capture baseline and protect CI trigger

**Files:**
- Create: `apps/pwa/src/__tests__/pwa-ci-workflow.test.ts`
- Modify: `.github/workflows/pwa-ci.yml`

- [ ] **Step 1: Capture the baseline audit and dependency chains**

Run:
```bash
node scripts/pwa-audit.mjs
pnpm why next --filter pwa --depth 8
pnpm why sharp --filter pwa --depth 8
pnpm why brace-expansion --filter pwa --depth 8
pnpm why chrome-launcher --filter pwa --depth 8
```

Expected: command records the current advisory list and confirms chains before any change.

- [ ] **Step 2: Write the failing workflow-path test**

Create `apps/pwa/src/__tests__/pwa-ci-workflow.test.ts`:
```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/pwa-ci.yml"), "utf8");

describe("PWA CI audit trigger", () => {
  it("watches the scoped audit script it executes", () => {
    expect(workflow).toContain('"scripts/pwa-audit.mjs"');
    expect(workflow).not.toContain('"scripts/check-pwa-audit.mjs"');
  });
});
```

- [ ] **Step 3: Prove the test fails against the stale path**

Run:
```bash
pnpm --dir apps/pwa exec vitest run src/__tests__/pwa-ci-workflow.test.ts
```

Expected: FAIL because the workflow still watches `scripts/check-pwa-audit.mjs`.

- [ ] **Step 4: Correct both workflow triggers**

Replace both occurrences of:
```yaml
- "scripts/check-pwa-audit.mjs"
```
with:
```yaml
- "scripts/pwa-audit.mjs"
```

- [ ] **Step 5: Verify trigger contract and commit**

Run:
```bash
pnpm --dir apps/pwa exec vitest run src/__tests__/pwa-ci-workflow.test.ts
git add .github/workflows/pwa-ci.yml apps/pwa/src/__tests__/pwa-ci-workflow.test.ts
git commit -m "fix: watch PWA audit script changes"
```

Expected: test PASS and one focused commit.

### Task 2: Upgrade Next with its matching config

**Files:**
- Modify: `apps/pwa/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Resolve the matching upstream pair**

Set exact versions in `apps/pwa/package.json`:
```json
"next": "16.2.12",
"eslint-config-next": "16.2.12"
```

Do not add `sharp`, `brace-expansion`, or `minimatch` overrides or patches.

- [ ] **Step 2: Regenerate lockfile with CI package manager**

Run in a Linux Node 20 container using pnpm 9.15.9:
```bash
pnpm install --lockfile-only --no-frozen-lockfile
pnpm install --frozen-lockfile
```

Expected: frozen installation succeeds.

- [ ] **Step 3: Prove this increment is safe**

Run:
```bash
pnpm --dir apps/pwa build:cloudflare
node scripts/pwa-audit.mjs
```

Expected: OpenNext build PASS and advisory count is no higher than the Task 1 baseline. If either fails, restore `apps/pwa/package.json` and `pnpm-lock.yaml` before Task 3.

- [ ] **Step 4: Commit only when both gates pass**

```bash
git add apps/pwa/package.json pnpm-lock.yaml
git commit -m "fix: update Next PWA dependencies"
```

### Task 3: Upgrade OpenNext without native-package overrides

**Files:**
- Modify: `apps/pwa/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Set the direct OpenNext release**

Set:
```json
"@opennextjs/cloudflare": "1.20.2"
```

Keep `sharp` unconstrained outside upstream dependency resolution.

- [ ] **Step 2: Rebuild lockfile and run the OpenNext gate**

Run in Linux Node 20/pnpm 9:
```bash
pnpm install --lockfile-only --no-frozen-lockfile
pnpm install --frozen-lockfile
pnpm --dir apps/pwa build:cloudflare
node scripts/pwa-audit.mjs
```

Expected: frozen install and Cloudflare build PASS; audit count does not increase. On failure, restore this task's manifest/lockfile changes and stop for upstream compatibility review.

- [ ] **Step 3: Commit the verified increment**

```bash
git add apps/pwa/package.json pnpm-lock.yaml
git commit -m "fix: update OpenNext Cloudflare"
```

### Task 4: Establish LHCI and ESLint upstream feasibility

**Files:**
- Modify: `apps/pwa/package.json` only if compatible releases exist.
- Modify: `pnpm-lock.yaml` only if a compatible release exists.

- [ ] **Step 1: Check direct release availability and peer ranges**

Run:
```bash
pnpm view @lhci/cli version peerDependencies --json
pnpm view eslint version peerDependencies --json
pnpm view eslint-config-next@16.2.12 peerDependencies --json
```

Expected: determine whether current direct upstream releases can remove `chrome-launcher` and ESLint/minimatch chains without violating peer requirements.

- [ ] **Step 2: Stop if no compatible upstream route exists**

If direct releases leave an advisory and require an override or patch, do not change manifests. Record the unresolved chain and ask for a separately approved exception specification.

- [ ] **Step 3: If compatible, make one direct increment and validate**

Run:
```bash
pnpm install --lockfile-only --no-frozen-lockfile
pnpm --dir apps/pwa build:cloudflare
node scripts/pwa-audit.mjs
```

Expected: build PASS and advisory count declines. Revert the increment if either expectation is false.

- [ ] **Step 4: Commit only a verified direct upgrade**

```bash
git add apps/pwa/package.json pnpm-lock.yaml
git commit -m "fix: update PWA audit dependencies"
```

### Task 5: Run release gates, review, and publish source changes

**Files:**
- Modify: `pnpm-lock.yaml` only if generated by pnpm 9.

- [ ] **Step 1: Validate Linux reproducibility**

Run in a clean Node 20/pnpm 9 Linux container:
```bash
pnpm install --frozen-lockfile
pnpm --dir apps/pwa lint
node scripts/pwa-audit.mjs
pnpm --dir apps/pwa build:cloudflare
```

Expected: all commands exit 0 and audit reports `PASS — no advisories`.

- [ ] **Step 2: Validate PWA quality gates**

Run:
```bash
pnpm --dir apps/pwa exec vitest run
pnpm --dir apps/pwa exec vitest run src/headers.test.ts
pnpm --dir apps/pwa exec lhci autorun
CI=1 pnpm --dir apps/pwa exec playwright test --config=e2e/playwright.config.ts --project=functional-mobile
pnpm --dir apps/pwa exec playwright test --config=scripts/offline-shell-spike/playwright.config.ts
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Supply-chain review and push**

Review the final manifest and lockfile diff for only direct compatible upgrades, no overrides/patches, and no VPS/API changes. Commit any remaining verified changes, then:
```bash
git push origin main
```

Expected: GitHub PWA CI is fully green before considering deployment.

- [ ] **Step 4: Stop before deployment**

Do not run Wrangler deploy. Request a fresh explicit deployment authorization after CI is green; use `docs/runbooks/pwa-cloudflare-release.md` only after that authorization.
