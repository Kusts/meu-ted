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

const REVOCATION_CODE_PATTERN = /forbidden|workspace|membership|revok/i;

/**
 * Membership-revocation signal (D10): the API revokes device/session
 * authorization on removeMember/leave (Phase 1). A 403 carrying a
 * workspace/forbidden code — or a bare 403 on a session/workspace fetch —
 * means the membership is gone: purge the offline snapshot and take the
 * unauthenticated transition.
 */
export function isMembershipRevocation(status: number, code?: string): boolean {
  if (status !== 403) return false;
  if (code === undefined || code.length === 0) return true;
  return REVOCATION_CODE_PATTERN.test(code) || code.startsWith("auth.");
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
