# Better Auth integration design

**Goal:** G4.3.1
**Status:** active contract
**Date:** 2026-08-02 (updated 2026-08-03)

## Objective

Better Auth is the product identity boundary after Cloudflare Access failed the G4.1.1 gate. The API and PWA use Better Auth's HttpOnly cookie session; legacy device tokens remain only as an explicit API compatibility path and are not part of the active PWA flow.

## Boundaries

### In scope

- Better Auth dependency and Postgres-backed configuration.
- Native Better Auth persistence migration, additive to the current schema.
- Minimal `memberships`/`invites` persistence for the next authorization goals.
- Fastify handler for Better Auth endpoints.
- Session resolution into a request context without trusting `X-Workspace-Id` or user-supplied identity.
- Cookie security, trusted origins/CSRF protection, logout and server-side session revocation.
- Contract tests for session identity, cookie behavior, logout/revocation, CSRF/origin rejection, and controlled device-token compatibility.

### Out of scope

- Full membership/invite workflows, workspace switching, and email mismatch race; these are G4.1.3–G4.2 goals.
- Full membership/invite/workspace management UI; this is G4.3.2.
- Cloudflare Access configuration or Agent WebSocket authorization.

## Architecture

```text
Browser/PWA
  -> /auth/* Fastify Better Auth handler
  -> HttpOnly session cookie
  -> Better Auth session store (Postgres)
  -> Fastify pre-handler
  -> AuthenticatedContext { userId, sessionId, householdId? }

PWA
  -> central `apiFetch` boundary (`credentials: include`)
  -> HttpOnly Better Auth session cookie
  -> optional `X-Workspace-Id` selected context (untrusted; API revalidates)

Legacy test/client
  -> X-Device-Token compatibility resolver (API only)
  -> DeviceContext
```

The API remains the only domain authority. Better Auth owns user/session/account/verification records. Financial authorization remains denied until a later membership resolver supplies a household context; no request may select a household by an untrusted header or body field.

## Session and security contract

- Session cookie is HttpOnly, Secure in production, SameSite=None in production because the PWA and API are cross-site; local HTTP development uses SameSite=Lax. Path is `/`.
- Allowed origins are explicit configuration; arbitrary `Origin` values are rejected for state-changing auth requests.
- Auth state-changing requests require Better Auth's CSRF/origin protections; tests must prove a cross-origin mutation is rejected.
- Logout invalidates the server-side session and clears the browser cookie.
- A revoked/expired session cannot resolve an authenticated request or recreate access through a stale cookie.
- Logs redact cookies, authorization headers, device tokens, and auth payloads.
- No service token is accepted as a substitute for the human session.

## PWA session boundary

- `apps/pwa/src/lib/api/client.ts` is the only request boundary: it includes credentials and may add the selected `X-Workspace-Id`; it never reads or emits a device token or Authorization bearer token.
- API CORS explicitly allows credentials and `X-Workspace-Id`; browser preflight must pass before selected-workspace requests.
- `AuthGate` validates `/auth/get-session`, performs minimal email/password sign-in through `/auth/sign-in/email`, and signs out through `/auth/sign-out`.
- A runtime 401 clears local snapshots/profile and returns to login; server logout remains authoritative.
- Workspace selection is deliberately not implemented here. G4.3.2 owns invite, workspace switching, and member management.

## Compatibility policy

`X-Device-Token` remains available only to the API's explicit legacy/test paths. It is not a public registration/bootstrap mechanism and is never sent by the active PWA flow. Session-backed routes must not silently fall back to a caller-provided user or workspace identifier.

## Persistence

Use Better Auth's official Postgres-compatible adapter/schema and add its tables with a versioned migration. The migration also creates minimal `memberships` and `invites` records for the next goals. It must be additive and preserve all existing `household_id` columns and rows. Better Auth table naming and column definitions must be generated from the installed package version, reviewed, and covered by the migration contract test; hand-written approximations are not acceptable.

## Test plan

1. Unauthenticated request has no authenticated context.
2. Valid Better Auth session resolves the authenticated user and session ID.
3. Invalid, expired, and revoked cookies are rejected.
4. Logout clears the cookie and makes the same session unusable server-side.
5. Cross-origin state-changing auth request is rejected.
6. Allowed origin and secure cookie attributes are enforced according to environment.
7. Device-token compatibility still works only on its existing explicit API path; registration remains disabled and the PWA never calls `/auth/devices/*`.
8. PWA client tests prove cookie credentials, workspace context, 401 cleanup, login, logout, and no device-token header.
9. Existing API tests remain green.

## Rollout and rollback

Enable Better Auth behind explicit configuration. Run additive migration before enabling session-backed product routes. Keep device-token compatibility during the transition. Roll back by disabling the Better Auth session path and preserving the migration/data; never copy credentials or downgrade a production session store destructively.

## Follow-up

G4.1.3 proves the security matrix in depth. G4.1.4/G4.1.5 implement and test invite/membership identity rules. G4.2 adds workspace authorization. G4.3.2 implements invite, workspace switching, and member management; later work may remove the API compatibility path when safe.
