# Device Token Inventory

**Phase:** G0.1.5 — Contenção de emergência
**Date:** 2026-07-29
**Status:** Rotated 2026-07-29 (see new-device-tokens.json)

## Tokens in codebase (post-rotation)

| Token | Device | Household | Location | Status |
|---|---|---|---|---|
| `40e59372-...` | `b42d8cbf-...` | DEMO_HOUSEHOLD_ID | `auth/device-token.ts:24` (in-memory) | **DEV-ONLY** — rotated 2026-07-29 |
| `14e64635-...` | `53512a51-...` | DEMO_HOUSEHOLD_ID | `auth/device-token.ts:25` (in-memory) | **DEV-ONLY** — rotated 2026-07-29 |
| `40e59372-...` | `dev-device-1` | HOUSEHOLD_A | `tests/test-app.ts:22` | **TEST-ONLY** — rotated 2026-07-29 |
| `14e64635-...` | `dev-device-2` | HOUSEHOLD_B | `tests/test-app.ts:23` | **TEST-ONLY** — rotated 2026-07-29 |
| `randomUUID()` | `dev-device-1` | DEMO_HOUSEHOLD_ID | `scripts/seed-demo.ts:47` (DB seed) | **DEV-ONLY** — generated at runtime |

## Revoked tokens

| Token | Previous location | Revocation date |
|---|---|---|
| `dev-token-1` | in-memory store, test-app.ts, seed-demo.ts | 2026-07-29 |
| `dev-token-2` | in-memory store, test-app.ts | 2026-07-29 |

## Production tokens

**Unknown.** Production Postgres not accessible from this session.
To complete rotation:

1. Connect to production Postgres
2. Run: `SELECT token, device_id, household_id, created_at FROM device_tokens WHERE revoked_at IS NULL;`
3. For each token, verify it belongs to an authorized device
4. Revoke unauthorized/stale tokens: `UPDATE device_tokens SET revoked_at = NOW() WHERE token = $1;`
5. Generate new tokens via offline/manual provisioning (registration endpoint is disabled per G0.1.2)
6. Distribute new tokens to authorized devices via secure channel

## Rotation procedure

Since device registration is disabled until Phase 4 (G0.1.2):
- New tokens must be provisioned via direct DB insert by authorized admin
- Token = `randomUUID()`, device_id = `randomUUID()`
- Document each provisioned token in this inventory

## Safeguards

- `POST /auth/devices/register` → 403 (disabled, G0.1.2)
- `POST /auth/devices/revoke` → requires auth with same token (G0.1.3)
- In-memory store tokens only exist in dev/test, never in production (DATABASE_URL required, G0.1.4)
- `seed-demo.ts` now requires test-marker validation before TRUNCATE/seed (G0.2.1)
