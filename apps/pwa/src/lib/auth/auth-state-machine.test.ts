import { describe, expect, it } from "vitest";
import {
  classifyAuthSignal,
  decideRoute,
  isMembershipRevocation,
  type AuthState,
} from "./auth-state-machine";

/**
 * V4.1 Phase 5 (Tasks 5.1–5.3, SPEC §12.1): explicit auth state machine.
 *
 * States: authenticated / unauthenticated / unreachable (+ offline snapshot
 * mode via decideRoute). A missing response must NEVER be classified as a
 * missing session.
 */
describe("auth state machine (SPEC §12.1)", () => {
  it("maps 401 to unauthenticated (→ login)", () => {
    const state: AuthState = classifyAuthSignal({ kind: "http", status: 401 });
    expect(state).toBe("unauthenticated");
    expect(decideRoute(state, true)).toBe("login");
    expect(decideRoute(state, false)).toBe("login");
  });

  it("maps 403 to unauthenticated (→ login, never offline mode)", () => {
    const state: AuthState = classifyAuthSignal({
      kind: "http",
      status: 403,
      code: "workspace.forbidden",
    });
    expect(state).toBe("unauthenticated");
    // A clearly invalid session must not unlock offline data.
    expect(decideRoute(state, true)).toBe("login");
  });

  it("maps timeout to unreachable (→ offline snapshot when available)", () => {
    const state: AuthState = classifyAuthSignal({ kind: "network-error" });
    expect(state).toBe("unreachable");
    expect(decideRoute(state, true)).toBe("offline-snapshot");
    expect(decideRoute(state, false)).toBe("login");
  });

  it("maps DNS failure to unreachable", () => {
    expect(classifyAuthSignal({ kind: "network-error" })).toBe("unreachable");
  });

  it("maps 5xx to unreachable (server fault, not session fault)", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classifyAuthSignal({ kind: "http", status })).toBe("unreachable");
    }
  });

  it("maps offline browser to unreachable", () => {
    expect(classifyAuthSignal({ kind: "offline" })).toBe("unreachable");
  });

  it("maps success to authenticated (→ online app)", () => {
    const state: AuthState = classifyAuthSignal({ kind: "success" });
    expect(state).toBe("authenticated");
    expect(decideRoute(state, true)).toBe("app");
    expect(decideRoute(state, false)).toBe("app");
  });

  it("never treats no-response as no-session", () => {
    // Every no-response signal lands on unreachable, never unauthenticated.
    const noResponse = [
      classifyAuthSignal({ kind: "network-error" }),
      classifyAuthSignal({ kind: "offline" }),
      classifyAuthSignal({ kind: "http", status: 500 }),
      classifyAuthSignal({ kind: "http", status: 503 }),
    ];
    for (const state of noResponse) {
      expect(state).not.toBe("unauthenticated");
    }
  });
});

describe("isMembershipRevocation (D10 revocation purge trigger)", () => {
  it("detects workspace_forbidden revocation codes", () => {
    expect(isMembershipRevocation(403, "workspace.forbidden")).toBe(true);
    expect(isMembershipRevocation(403, "auth.workspace_forbidden")).toBe(true);
    expect(isMembershipRevocation(403, "agent.workspace_forbidden")).toBe(true);
  });

  it("treats a bare 403 on a session/workspace fetch as revocation (fail-closed)", () => {
    expect(isMembershipRevocation(403, undefined)).toBe(true);
  });

  it("ignores non-403 statuses", () => {
    expect(isMembershipRevocation(401, "workspace.forbidden")).toBe(false);
    expect(isMembershipRevocation(500, "workspace.forbidden")).toBe(false);
    expect(isMembershipRevocation(200, "workspace.forbidden")).toBe(false);
  });
});
