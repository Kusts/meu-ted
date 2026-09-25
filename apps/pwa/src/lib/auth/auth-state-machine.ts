/**
 * Auth state machine (V4.1 Phase 5, Tasks 5.1–5.3, SPEC §12.1).
 *
 * Pure module — no I/O, no storage, no imports. Callers (apiFetch,
 * sync-engine bootstrap, AuthGate) classify transport signals through
 * {@link classifyAuthSignal} and route through {@link decideRoute}.
 *
 * States:
 * - authenticated → online app;
 * - unauthenticated → login (401/403: the server answered "no session");
 * - unreachable → evaluate the offline snapshot (timeout, DNS failure,
 *   5xx, offline browser: the server never answered about the session).
 *
 * Core invariant: a missing response is NEVER classified as a missing
 * session. Only an explicit server rejection (401/403) takes the
 * unauthenticated transition, so offline mode can never unlock a clearly
 * invalid session.
 */

export type AuthState = "authenticated" | "unauthenticated" | "unreachable";

/** Where the UI must go for a given state (+ snapshot availability). */
export type AuthRoute = "app" | "login" | "offline-snapshot";

export type AuthSignal =
  | { kind: "success" }
  | { kind: "http"; status: number; code?: string }
  | { kind: "network-error" }
  | { kind: "offline" };

/**
 * Exact server-contract allowlist for membership revocation. The API emits
 * `auth.workspace_forbidden` when no active membership exists for the
 * workspace (device-access resolution, session-context forbidden, request
 * preHandler, agent revalidation) — the removeMember/leave revocation
 * signal. Every other 403 code is a permission/scope denial (owner-only
 * `workspace.forbidden`, `auth.admin_forbidden`, `auth.invite_forbidden`,
 * delegation/device codes) or an unrelated error: the caller is still a
 * member, so the offline snapshot must NOT be purged.
 */
const MEMBERSHIP_REVOCATION_CODES: ReadonlySet<string> = new Set([
  "auth.workspace_forbidden",
]);

/**
 * Membership-revocation signal (D10): the API revokes device/session
 * authorization on removeMember/leave (Phase 1). Only a 403 carrying the
 * explicit membership-denial code means the membership is gone: purge the
 * offline snapshot and take the unauthenticated transition. A bare 403
 * without a code carries no route context here — any permission denial can
 * produce one — so it must NOT trigger the global purge. Direct 401/403 on
 * the /auth/session probe is classified separately by fetchSession through
 * its own contract and is unaffected by this function.
 */
export function isMembershipRevocation(status: number, code?: string): boolean {
  if (status !== 403) return false;
  if (code === undefined || code.length === 0) return false;
  return MEMBERSHIP_REVOCATION_CODES.has(code);
}

/**
 * Classify one transport signal into an auth state. Any signal that is not
 * an explicit server rejection leaves the session un-killed: unknown and
 * server-fault statuses map to unreachable (cannot confirm the session,
 * must not destroy it).
 */
export function classifyAuthSignal(signal: AuthSignal): AuthState {
  switch (signal.kind) {
    case "success":
      return "authenticated";
    case "offline":
    case "network-error":
      return "unreachable";
    case "http":
      if (signal.status === 401 || signal.status === 403) return "unauthenticated";
      return "unreachable";
  }
}

/**
 * Route for a state. Unauthenticated always goes to login — even with a
 * valid snapshot present, offline mode must never unlock a clearly invalid
 * session. Unreachable evaluates the offline snapshot when one exists.
 */
export function decideRoute(state: AuthState, snapshotAvailable: boolean): AuthRoute {
  if (state === "authenticated") return "app";
  if (state === "unauthenticated") return "login";
  return snapshotAvailable ? "offline-snapshot" : "login";
}
