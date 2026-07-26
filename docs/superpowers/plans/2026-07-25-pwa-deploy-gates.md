# PWA Deploy Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar PWA Cloudflare para deploy reproduzível, sem publicar.

**Architecture:** Baseline fica versionado. Root delega build Cloudflare existente. Runbook registra release manual, SHA, health checks e rollback. Docker fornece Linux Node 20/pnpm 9 isolado.

**Tech Stack:** Next 16, OpenNext Cloudflare, Wrangler 4.104, Vitest, Playwright, Docker Node 20, pnpm 9.15.9.

**Agent Orchestration:** Supervisor-Workers — coder implementa; reviewer valida diff/gates.

## Files

| Path | Change |
|---|---|
| `apps/pwa/budget.json` | Restaurar baseline histórico exato |
| `apps/pwa/src/__tests__/root-build-script.test.ts` | Contrato root build canônico |
| `package.json` | Delegar `build:pwa` ao build Cloudflare |
| `docs/runbooks/pwa-cloudflare-release.md` | Runbook manual release/rollback |

### Task 1: Restore bundle baseline

**Files:** Create `apps/pwa/budget.json`.

- [ ] Write RED test command:

```bash
pnpm --dir apps/pwa exec vitest run src/__tests__/bundle-budget.test.ts
```

Expected: FAIL `ENOENT` for `apps/pwa/budget.json`.

- [ ] Restore exact historical file:

```json
{
  "timestamp": "2026-07-15",
  "initialGzipKB": 135.9,
  "totalGzipKB": 280.7,
  "regressionLimit": 5,
  "notes": "Baseline = ORIGINAL all-chunks total (280.7 KB) measured before Next.js 16.2.9 emitted the per-route AppRouter (624-*) and React error-decoder (3896037c-*) chunks. Those two framework chunks (~121.7 KB gzipped) are NOT application code and are excluded from the equivalent set; app/ lazy route chunks ARE included (not excluded merely because lazy). The 5% regression gate (bundle-budget.test.ts) compares the measured equivalent-set total (all chunks minus the 624-*/3896037c-* framework chunks) to 280.7 KB (max 294.735 KB)."
}
```

- [ ] Build then verify GREEN:

```bash
pnpm --dir apps/pwa build:cloudflare
pnpm --dir apps/pwa exec vitest run src/__tests__/bundle-budget.test.ts
```

Expected: 9 tests pass.

- [ ] Commit:

```bash
git add apps/pwa/budget.json
git commit -m "fix: restore PWA bundle baseline"
```

### Task 2: Make root build canonical

**Files:** Create `apps/pwa/src/__tests__/root-build-script.test.ts`; Modify `package.json`.

- [ ] Write RED test:

```ts
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("delegates root PWA build to Cloudflare webpack build", () => {
  const root = path.resolve(__dirname, "../../../../package.json");
  const scripts = JSON.parse(fs.readFileSync(root, "utf8")).scripts;
  expect(scripts["build:pwa"]).toBe("pnpm --filter pwa build:cloudflare");
});
```

- [ ] Verify RED:

```bash
pnpm --dir apps/pwa exec vitest run src/__tests__/root-build-script.test.ts
```

Expected: FAIL; current value is `pnpm --filter pwa build`.

- [ ] Change root script:

```json
"build:pwa": "pnpm --filter pwa build:cloudflare"
```

- [ ] Verify GREEN:

```bash
pnpm --dir apps/pwa exec vitest run src/__tests__/root-build-script.test.ts
```

Expected: 1 test passes.

- [ ] Commit:

```bash
git add package.json apps/pwa/src/__tests__/root-build-script.test.ts
git commit -m "fix: make PWA build use Cloudflare webpack"
```

### Task 3: Document controlled Cloudflare release

**Files:** Create `docs/runbooks/pwa-cloudflare-release.md`.

- [ ] Create runbook with following commands and explicit confirmation boundary:

```bash
SHA="$(git rev-parse --short=12 HEAD)"
pnpm --dir apps/pwa build:cloudflare
pnpm --dir apps/pwa exec wrangler deploy --message "git:${SHA}"
pnpm --dir apps/pwa exec wrangler versions list --name pi-finance-pwa
curl --fail --silent --show-error https://pi-finance-pwa.walissonead.workers.dev/pwa-control
# Only after explicit human confirmation if rollback is needed:
pnpm --dir apps/pwa exec wrangler rollback 817a9ac0-6f64-455d-b811-471e0bcb96a6 --name pi-finance-pwa --message "rollback git:${SHA}"
```

- [ ] Include gates before deploy: clean Git; PWA lint; Cloudflare build; complete PWA Vitest including budget and headers; offline Playwright; public `/`, `/sw.js`, manifest and `/pwa-control` health checks.

- [ ] Verify command syntax without deployment:

```bash
pnpm --dir apps/pwa exec wrangler deploy --help
pnpm --dir apps/pwa exec wrangler versions list --help
pnpm --dir apps/pwa exec wrangler rollback --help
```

Expected: exit 0.

- [ ] Commit:

```bash
git add docs/runbooks/pwa-cloudflare-release.md
git commit -m "docs: add PWA Cloudflare release runbook"
```

### Task 4: Validate isolated Linux gate

**Files:** No source changes.

- [ ] Run Docker Linux gate from repository root:

```bash
docker run --rm -v "$PWD:/workspace" -w /workspace node:20-bookworm-slim sh -lc '
  corepack enable && corepack prepare pnpm@9.15.9 --activate &&
  pnpm install --frozen-lockfile &&
  pnpm --dir apps/pwa lint &&
  pnpm --dir apps/pwa build:cloudflare &&
  pnpm --dir apps/pwa exec vitest run &&
  pnpm --dir apps/pwa exec vitest run src/headers.test.ts
'
```

Expected: exit 0. If build fails only due unsupported host mount/Windows path, record exact error; do not weaken gate.

- [ ] Run offline E2E in same image after installing Chromium:

```bash
docker run --rm -v "$PWD:/workspace" -w /workspace node:20-bookworm-slim sh -lc '
  corepack enable && corepack prepare pnpm@9.15.9 --activate &&
  pnpm install --frozen-lockfile &&
  pnpm --dir apps/pwa exec playwright install --with-deps chromium &&
  pnpm --dir apps/pwa build:next:cloudflare &&
  pnpm --dir apps/pwa exec playwright test --config=scripts/offline-shell-spike/playwright.config.ts
'
```

Expected: 6 tests pass.

- [ ] Verify no uncommitted changes:

```bash
git status --short
```

Expected: empty output.

## Tests

| Type | Tool | Scope |
|---|---|---|
| Unit | Vitest | root build script contract; bundle baseline |
| Integration | OpenNext build + Vitest | budget and `_headers` artifact |
| E2E | Playwright | offline shell |
| Contract | curl | deployed health only; no deploy during this plan |
| Mutation | N/A | configuration/docs only; no new runtime logic |

## Self-review

- Spec coverage: Tasks 1–4 cover REQ-1 through REQ-5.
- No deploy, VPS/API, bridge, threshold recalibration included.
- Commands validated against Wrangler 4.104 help; Docker Node 20/pnpm 9.15.9 verified locally.
