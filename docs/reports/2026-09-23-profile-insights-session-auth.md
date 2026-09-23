# Report — Session-auth coverage for /profile and /insights (PR #18)

- **Date:** 2026-09-23
- **PR:** #18 (`fix/profile-insights-session-auth`)
- **Severity:** P1 — completes the login flow in production

## Symptom

After the device-lineage fix (PR #17), sign-in (200) and device registration
(201) succeeded, but `GET /profile` and `GET /insights/quick` returned
`401 auth.missing_token` right after login. AuthGate treats the 401 as an
expired session and bounces the user back to the login screen: a fresh login
could never complete.

## Root cause

`/profile` (GET/PATCH), `/insights/quick` and `/insights/spending` still did
their own device-token-only authentication outside the unified preHandler.
Under ADR-015 Option C (session-first), the PWA no longer attaches
`X-Device-Token` implicitly — it authenticates with the Better-Auth session
(Bearer during the compat window, cookie-only after Release B) plus
`X-Workspace-Id`. Two routes never learned the session contract.

Captured in production (Playwright, fresh profile): every session-authenticated
call returned 200 while `/profile` and `/insights/quick` returned
`401 {"code":"auth.missing_token"}` with the same Bearer + workspace headers.

## Fix

Apply the established pattern (already used by `/insights/payment-score`,
`/insights/installment-score`, `/insights/monthly-projection`): prefer
`request.authenticatedContext` from the unified preHandler, fall back to the
device-token resolver for legacy clients.

## Verification

- New route tests: unified context path resolves the household with the device
  resolver unreachable (profile GET+PATCH, insights/quick).
- Legacy device-token tests keep passing (fallback preserved).
- Local full API suite with Postgres: 2263 passed; the only failure
  (`postgres-canonical-parity-v41`) reproduces on clean `main` without these
  changes and is environment-specific to the local test database (CI green on
  the same SHA).
