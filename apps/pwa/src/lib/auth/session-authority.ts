/**
 * Session authority — explicit session state for the PWA (V4.1 Closure
 * AUTH-01, SPEC §4).
 *
 * The authenticated state NEVER comes from a JavaScript-readable bearer
 * (device token / session bearer / localStorage token): it comes from a
 * server-confirmed session probe (GET /auth/session). Storage tokens are
 * only a legacy fallback for the compat window
 * (`NEXT_PUBLIC_LEGACY_BEARER_COMPAT`, token-store.ts) and must not decide
 * authentication on their own.
 *
 * Pure module-level store (no React) so synchronous gates such as
 * `apiUsable()` in app-state-context can read it without a render cycle.
 * AuthGate is the writer (probe → setSessionStatus) and mirrors the value
 * into SessionContext for React consumers. Identity is non-secret
 * (user id / email / name) — never a bearer, cookie value, or device
 * secret (INV-03).
 */

export type SessionSnapshot =
  | { status: "authenticated"; user: { userId: string; email?: string; name?: string } }
  | { status: "unauthenticated" }
  | { status: "unreachable"; offlinePrincipalId?: string }
  | { status: "unknown" };

let current: SessionSnapshot = { status: "unknown" };

/** Current session authority value (synchronous read for non-React gates). */
export function getSessionStatus(): SessionSnapshot {
  return current;
}

/** Written by AuthGate from the session probe; by expireSession on 401/403. */
export function setSessionStatus(next: SessionSnapshot): void {
  current = next;
}

/** Test/isolated-boot helper: back to the pre-probe state. */
export function resetSessionStatus(): void {
  current = { status: "unknown" };
}
