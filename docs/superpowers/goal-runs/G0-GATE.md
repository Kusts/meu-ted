# Gate G0 — verification evidence

**Date:** 2026-07-29
**Status:** verified locally; production deployment remains blocked by governance/snapshot authorization.

## Critical containment checks

| Gate | Evidence | Result |
|---|---|---|
| Anonymous device registration denied | `tests/auth/device-register-blocked.test.ts` | PASS |
| Same providerMessageId has one effect | `src/bridge-containment.test.ts` | PASS |
| Pi calls isolated by chatId | `src/bridge-containment.test.ts`, `src/pi-client-factory.test.ts` | PASS |
| Idempotency 4+ concurrent requests | API auth + Postgres containment tests | PASS |
| Test DB destructive guard | `tests/db/db-guard.test.ts` | PASS |
| Web process does not migrate | `server/index.ts` has no `runMigrations`; migration policy test | PASS |
| Web schema verification | `server/schema-verifier.test.ts` | PASS |
| Migration job checksum/lock/backup gate | `migration-job-policy.test.ts` + disposable Postgres run | PASS |

## Commands

- API: 297 passed, 3 external integration skips.
- Bridge containment/factory: 27 passed.
- DB guard/schema policy and destructive wiring: 14 passed.
- `pnpm governance:check`: passed.
- `git diff --check`: passed.

## Critical audit ledger

Detailed event IDs, queries and outputs: `docs/security/g0-critical-resolution.md`.

Full disposable Postgres integration run: 3 files, 34/34 tests passed with `DATABASE_URL_TEST` and `DB_TEST_MARKER`.

## Boundary

No deploy, VPS, Cloudflare, or production database operation was performed. The gate is repository/test evidence only.
