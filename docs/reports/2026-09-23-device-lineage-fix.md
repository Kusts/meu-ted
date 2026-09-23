# Report — Device token lineage fix (uuid column vs Better-Auth TEXT id)

- **Date:** 2026-09-23
- **PR:** #17 (`fix/device-token-userid-lineage-uuid`)
- **Severity:** P1 — blocks every fresh session login in production

## Symptom

`POST /auth/sign-in/email` returns 200, then the PWA's immediate
`POST /auth/devices/register` returns 500 with
`invalid input syntax for type uuid: "WUCG..."` (Postgres 22P02). The UI
surfaces the raw error and the login flow never completes.

## Root cause

V053 (`device_token_hardening`) made `device_tokens.user_id` a **UUID**
column with user lineage, but the register path inserted the **Better-Auth
TEXT id** taken from the session. Postgres rejects the value. The same
identity-space mismatch affected `rotate` (successor insert of a raw TEXT id
when the predecessor had no owner, and TEXT-vs-UUID comparisons that made
every session-verified rotation mismatch).

## Fix

- `register`: resolve the session user via
  `users (auth_user_id = $1 OR id::text = $1)` and persist the **application
  `users.id`**; unresolvable actors keep NULL lineage (same pattern as
  `writes/postgres.ts` audit lineage).
- `rotate` (postgres): resolve the session user **inside the rotation
  transaction** before the mismatch check; the successor always stores a
  valid UUID.
- `resolve-user-id.ts`: accepts `Pool | PoolClient`; guards non-string ids.

## Verification

- TDD: new lineage tests written RED first (`device-token-postgres-scope`):
  register resolve / NULL fallback / anonymous bootstrap; rotate adopt /
  identity-space verify / mismatch 403 fail-closed.
- Legacy contract tests updated (`device-token-hash`, `device-token-rotation`).
- Real-Postgres fixtures updated to seed the `"user"` + `users` identity rows
  (production invariant: a session only exists for a real user).
- Full API suite with Postgres: 2252 passed, 0 failed (local mirror of the CI
  job).

## Follow-ups

- None blocking. The device lineage `revokeAllForUserWorkspace` dual-match
  (`user_id::text = $1 OR auth_user_id-linked`) remains compatible: new rows
  store the application id, legacy rows keep whatever V053 backfilled.
