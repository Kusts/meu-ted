# Final Project Validation Report (VAL.1–VAL.13)

**Evaluated At:** 2026-09-13T22:44:39.109Z  
**Status:** FAILED ❌  
**Total Gates:** 13 | **Passed:** 11 | **Failed:** 1  

## Gate Execution Ledger

| ID | Gate Name | Command | Exit Code | Status |
|---|---|---|---|---|
| **VAL.1** | Reproducible Frozen Install | `git diff --exit-code -- pnpm-lock.yaml` | 0 | PASS ✅ |
| **VAL.2** | Lint & Documentation | `pnpm lint && pnpm docs:lint` | 0 | PASS ✅ |
| **VAL.3** | TypeScript Compilation | `pnpm typecheck` | 0 | PASS ✅ |
| **VAL.4** | API Unit & Contract Tests | `pnpm --filter meu-ted-api --fail-if-no-match test` | 0 | PASS ✅ |
| **VAL.5** | Agent Tests & Deterministic Evals | `pnpm --filter pi-finance-agent --fail-if-no-match test && pnpm --filter pi-finance-agent --fail-if-no-match eval:ted-v2` | 0 | PASS ✅ |
| **VAL.6** | Codex Broker | `pnpm --filter pi-finance-codex-broker --fail-if-no-match typecheck && pnpm --filter pi-finance-codex-broker --fail-if-no-match test && pnpm --filter pi-finance-codex-broker --fail-if-no-match build` | 0 | PASS ✅ |
| **VAL.7** | PWA Unit & Contract Tests | `pnpm --filter pwa --fail-if-no-match test` | 0 | PASS ✅ |
| **VAL.8** | Architecture Invariants | `pnpm architecture:check` | 0 | PASS ✅ |
| **VAL.9** | Capabilities, Write Policy & Governance | `pnpm capabilities:check && pnpm write-policy:check && pnpm governance:check` | 0 | PASS ✅ |
| **VAL.10** | Canonical Documentation Contracts | `node --test scripts/canonical-docs-contract.test.mjs scripts/documentation-facts-contract.test.mjs` | 0 | PASS ✅ |
| **VAL.11** | Builds & Distribution Artifacts | `pnpm build:all` | 0 | PASS ✅ |
| **VAL.12** | Security & Container Smoke | `pnpm security:check && pnpm container:smoke` | 1 | FAIL ❌ |

## Execution Details

### VAL.1 — Reproducible Frozen Install
- **Command:** `git diff --exit-code -- pnpm-lock.yaml`
- **Duration:** 2026-09-13T22:36:03.452Z → 2026-09-13T22:36:03.507Z
- **Result:** Execution completed successfully with exit code 0

### VAL.2 — Lint & Documentation
- **Command:** `pnpm lint && pnpm docs:lint`
- **Duration:** 2026-09-13T22:36:03.507Z → 2026-09-13T22:36:24.710Z
- **Result:** Execution completed successfully with exit code 0

### VAL.3 — TypeScript Compilation
- **Command:** `pnpm typecheck`
- **Duration:** 2026-09-13T22:36:24.710Z → 2026-09-13T22:36:45.142Z
- **Result:** Execution completed successfully with exit code 0

### VAL.4 — API Unit & Contract Tests
- **Command:** `pnpm --filter meu-ted-api --fail-if-no-match test`
- **Duration:** 2026-09-13T22:36:45.142Z → 2026-09-13T22:39:33.207Z
- **Result:** Execution completed successfully with exit code 0

### VAL.5 — Agent Tests & Deterministic Evals
- **Command:** `pnpm --filter pi-finance-agent --fail-if-no-match test && pnpm --filter pi-finance-agent --fail-if-no-match eval:ted-v2`
- **Duration:** 2026-09-13T22:39:33.207Z → 2026-09-13T22:39:57.352Z
- **Result:** Execution completed successfully with exit code 0

### VAL.6 — Codex Broker
- **Command:** `pnpm --filter pi-finance-codex-broker --fail-if-no-match typecheck && pnpm --filter pi-finance-codex-broker --fail-if-no-match test && pnpm --filter pi-finance-codex-broker --fail-if-no-match build`
- **Duration:** 2026-09-13T22:39:57.352Z → 2026-09-13T22:40:02.967Z
- **Result:** Execution completed successfully with exit code 0

### VAL.7 — PWA Unit & Contract Tests
- **Command:** `pnpm --filter pwa --fail-if-no-match test`
- **Duration:** 2026-09-13T22:40:02.967Z → 2026-09-13T22:42:33.217Z
- **Result:** Execution completed successfully with exit code 0

### VAL.8 — Architecture Invariants
- **Command:** `pnpm architecture:check`
- **Duration:** 2026-09-13T22:42:33.217Z → 2026-09-13T22:42:33.722Z
- **Result:** Execution completed successfully with exit code 0

### VAL.9 — Capabilities, Write Policy & Governance
- **Command:** `pnpm capabilities:check && pnpm write-policy:check && pnpm governance:check`
- **Duration:** 2026-09-13T22:42:33.722Z → 2026-09-13T22:42:35.173Z
- **Result:** Execution completed successfully with exit code 0

### VAL.10 — Canonical Documentation Contracts
- **Command:** `node --test scripts/canonical-docs-contract.test.mjs scripts/documentation-facts-contract.test.mjs`
- **Duration:** 2026-09-13T22:42:35.173Z → 2026-09-13T22:42:35.354Z
- **Result:** Execution completed successfully with exit code 0

### VAL.11 — Builds & Distribution Artifacts
- **Command:** `pnpm build:all`
- **Duration:** 2026-09-13T22:42:35.354Z → 2026-09-13T22:43:17.698Z
- **Result:** Execution completed successfully with exit code 0

### VAL.12 — Security & Container Smoke
- **Command:** `pnpm security:check && pnpm container:smoke`
- **Duration:** 2026-09-13T22:43:17.698Z → 2026-09-13T22:44:39.109Z
- **Result:** Execution failed with exit code 1

