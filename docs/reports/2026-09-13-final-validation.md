# Final Project Validation Report (VAL.1–VAL.13)

**Evaluated At:** 2026-09-14T01:17:35.540Z  
**Status:** FAILED ❌  
**Total Gates:** 13 | **Passed:** 6 | **Failed:** 1  

## Gate Execution Ledger

| ID | Gate Name | Command | Exit Code | Status |
|---|---|---|---|---|
| **VAL.1** | Reproducible Frozen Install | `git diff --exit-code -- pnpm-lock.yaml` | 0 | PASS ✅ |
| **VAL.2** | Lint & Documentation | `pnpm lint && pnpm docs:lint` | 0 | PASS ✅ |
| **VAL.3** | TypeScript Compilation | `pnpm typecheck` | 0 | PASS ✅ |
| **VAL.4** | API Unit & Contract Tests | `pnpm --filter meu-ted-api --fail-if-no-match test` | 0 | PASS ✅ |
| **VAL.5** | Agent Tests & Deterministic Evals | `pnpm --filter pi-finance-agent --fail-if-no-match test && pnpm --filter pi-finance-agent --fail-if-no-match eval:ted-v2` | 0 | PASS ✅ |
| **VAL.6** | Codex Broker | `pnpm --filter pi-finance-codex-broker --fail-if-no-match typecheck && pnpm --filter pi-finance-codex-broker --fail-if-no-match test && pnpm --filter pi-finance-codex-broker --fail-if-no-match build` | 0 | PASS ✅ |
| **VAL.7** | PWA Unit & Contract Tests | `pnpm --filter pwa --fail-if-no-match test` | 1 | FAIL ❌ |

## Execution Details

### VAL.1 — Reproducible Frozen Install
- **Command:** `git diff --exit-code -- pnpm-lock.yaml`
- **Duration:** 2026-09-14T01:08:42.334Z → 2026-09-14T01:08:42.394Z
- **Result:** Execution completed successfully with exit code 0

### VAL.2 — Lint & Documentation
- **Command:** `pnpm lint && pnpm docs:lint`
- **Duration:** 2026-09-14T01:08:42.394Z → 2026-09-14T01:10:06.035Z
- **Result:** Execution completed successfully with exit code 0

### VAL.3 — TypeScript Compilation
- **Command:** `pnpm typecheck`
- **Duration:** 2026-09-14T01:10:06.035Z → 2026-09-14T01:10:24.886Z
- **Result:** Execution completed successfully with exit code 0

### VAL.4 — API Unit & Contract Tests
- **Command:** `pnpm --filter meu-ted-api --fail-if-no-match test`
- **Duration:** 2026-09-14T01:10:24.886Z → 2026-09-14T01:13:42.402Z
- **Result:** Execution completed successfully with exit code 0

### VAL.5 — Agent Tests & Deterministic Evals
- **Command:** `pnpm --filter pi-finance-agent --fail-if-no-match test && pnpm --filter pi-finance-agent --fail-if-no-match eval:ted-v2`
- **Duration:** 2026-09-14T01:13:42.402Z → 2026-09-14T01:14:10.852Z
- **Result:** Execution completed successfully with exit code 0

### VAL.6 — Codex Broker
- **Command:** `pnpm --filter pi-finance-codex-broker --fail-if-no-match typecheck && pnpm --filter pi-finance-codex-broker --fail-if-no-match test && pnpm --filter pi-finance-codex-broker --fail-if-no-match build`
- **Duration:** 2026-09-14T01:14:10.852Z → 2026-09-14T01:14:17.175Z
- **Result:** Execution completed successfully with exit code 0

### VAL.7 — PWA Unit & Contract Tests
- **Command:** `pnpm --filter pwa --fail-if-no-match test`
- **Duration:** 2026-09-14T01:14:17.175Z → 2026-09-14T01:17:35.540Z
- **Result:** Execution failed with exit code 1

