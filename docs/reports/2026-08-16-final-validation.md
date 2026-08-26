# Final Project Validation Report (VAL.1–VAL.10)

**Evaluated At:** 2026-08-19T05:30:47.032Z  
**Status:** FAILED ❌  
**Total Gates:** 10 | **Passed:** 8 | **Failed:** 1  

## Gate Execution Ledger

| ID | Gate Name | Command | Exit Code | Status |
|---|---|---|---|---|
| **VAL.1** | Reproducible Frozen Install | `git diff --exit-code -- pnpm-lock.yaml` | 0 | PASS ✅ |
| **VAL.2** | Lint & Code Quality | `pnpm docs:lint` | 0 | PASS ✅ |
| **VAL.3** | TypeScript Compilation | `pnpm typecheck` | 0 | PASS ✅ |
| **VAL.4** | Unit & Contract Tests | `pnpm --filter pi-finance-api test && pnpm --filter @pi-financeiro/whatsapp-bridge test && pnpm --filter pi-finance-agent test` | 0 | PASS ✅ |
| **VAL.5** | Coverage & Safety Boundaries | `node scripts/check-write-policy.mjs` | 0 | PASS ✅ |
| **VAL.6** | PostgreSQL & Monotonic Migrations | `npx tsx scripts/cutover-check.ts` | 0 | PASS ✅ |
| **VAL.7** | E2E Critical Flows & Authz | `node --test scripts/canonical-docs-contract.test.mjs` | 0 | PASS ✅ |
| **VAL.8** | Builds & Distribution Artifacts | `pnpm build:all` | 0 | PASS ✅ |
| **VAL.9** | Security Secrets & Deps | `pnpm security:check` | 1 | FAIL ❌ |

## Execution Details

### VAL.1 — Reproducible Frozen Install
- **Command:** `git diff --exit-code -- pnpm-lock.yaml`
- **Duration:** 2026-08-19T05:26:12.168Z → 2026-08-19T05:26:12.263Z
- **Result:** Execution completed successfully with exit code 0

### VAL.2 — Lint & Code Quality
- **Command:** `pnpm docs:lint`
- **Duration:** 2026-08-19T05:26:12.263Z → 2026-08-19T05:26:12.787Z
- **Result:** Execution completed successfully with exit code 0

### VAL.3 — TypeScript Compilation
- **Command:** `pnpm typecheck`
- **Duration:** 2026-08-19T05:26:12.787Z → 2026-08-19T05:27:04.025Z
- **Result:** Execution completed successfully with exit code 0

### VAL.4 — Unit & Contract Tests
- **Command:** `pnpm --filter pi-finance-api test && pnpm --filter @pi-financeiro/whatsapp-bridge test && pnpm --filter pi-finance-agent test`
- **Duration:** 2026-08-19T05:27:04.025Z → 2026-08-19T05:29:06.071Z
- **Result:** Execution completed successfully with exit code 0

### VAL.5 — Coverage & Safety Boundaries
- **Command:** `node scripts/check-write-policy.mjs`
- **Duration:** 2026-08-19T05:29:06.071Z → 2026-08-19T05:29:06.741Z
- **Result:** Execution completed successfully with exit code 0

### VAL.6 — PostgreSQL & Monotonic Migrations
- **Command:** `npx tsx scripts/cutover-check.ts`
- **Duration:** 2026-08-19T05:29:06.741Z → 2026-08-19T05:29:17.131Z
- **Result:** Execution completed successfully with exit code 0

### VAL.7 — E2E Critical Flows & Authz
- **Command:** `node --test scripts/canonical-docs-contract.test.mjs`
- **Duration:** 2026-08-19T05:29:17.131Z → 2026-08-19T05:29:17.284Z
- **Result:** Execution completed successfully with exit code 0

### VAL.8 — Builds & Distribution Artifacts
- **Command:** `pnpm build:all`
- **Duration:** 2026-08-19T05:29:17.284Z → 2026-08-19T05:30:32.642Z
- **Result:** Execution completed successfully with exit code 0

### VAL.9 — Security Secrets & Deps
- **Command:** `pnpm security:check`
- **Duration:** 2026-08-19T05:30:32.642Z → 2026-08-19T05:30:47.032Z
- **Result:** Execution failed with exit code 1

