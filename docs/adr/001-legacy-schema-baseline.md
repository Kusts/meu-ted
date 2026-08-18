# ADR-001: Legacy schema confirmed as baseline

**Status:** accepted
**Date:** 2026-07-29
**Phase:** 2.1

## Context

The project has TWO migration paths:
1. **Canonical** (V001–V012): Full schema created by `pnpm db:migrate`. Defines `set_updated_at()` trigger function in V001.
2. **Legacy** (`DB_SCHEMA=legacy`): Schema created by Agent Pi (`.pi/extensions/financial-tools/`). V001 is skipped (no trigger function). Only safe additive migrations run: V003, V008–V016.

Both paths support the same 15 tables. The codebase has adapters for both: `postgres-store.ts` (canonical) and `legacy-postgres-store.ts` (legacy).

## Decision

**The legacy schema is confirmed as the production baseline.** Evidence:

1. **The legacy DB has real data.** It was populated by the Agent Pi before the API existed. The canonical path was designed as a clean-room equivalent but never received production traffic.
2. **The legacy path is strictly additive.** V003, V008–V012 only `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN IF NOT EXISTS`. No destructive operations. This makes it safer for production.
3. **Both paths converge.** After applying all safe migrations (V003, V008–V016), the legacy schema has the shared operational tables and lifecycle columns required by the API. Legacy audit rows retain their historical shape; the idempotency adapter writes that shape explicitly. The only difference is the `set_updated_at()` trigger function and its triggers.
4. **The `DB_SCHEMA=legacy` flag already gates the path.** Production uses legacy. Tests use canonical (in-memory). This separation is intentional and documented.

## Consequences

- **Canonical V001, V002, V004–V007 are archived as reference.** They document the ideal schema but are not applied to production.
- **New migrations MUST be safe for both paths** (use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).
- **The `set_updated_at()` trigger** is NOT present in legacy. Application code must explicitly set `updated_at` when needed, or we accept that the column is managed manually.
- **Future Phase 4 (identity)** will add `users`, `memberships`, `invites` tables. These must also support the legacy path.

## Alternatives considered

- **Force canonical on production:** Rejected — would require migrating real data into the canonical schema, risking data loss.
- **Maintain both paths indefinitely:** Rejected — increases maintenance burden. The legacy path is the single baseline going forward.
- **Drop canonical entirely:** Rejected — the canonical path serves as documentation and is used in tests (in-memory stores don't need either).
