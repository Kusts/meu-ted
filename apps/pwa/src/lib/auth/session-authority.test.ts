import { describe, expect, it, beforeEach } from "vitest";
import {
  getSessionStatus,
  resetSessionStatus,
  setSessionStatus,
} from "./session-authority";

/**
 * V4.1 Closure AUTH-01: explicit session authority — authenticated /
 * unauthenticated / unreachable (+ unknown pre-probe), identity non-secret.
 */
describe("session authority (AUTH-01)", () => {
  beforeEach(() => {
    resetSessionStatus();
  });

  it("starts unknown (pre-probe: no auth decision yet)", () => {
    expect(getSessionStatus()).toEqual({ status: "unknown" });
  });

  it("holds an authenticated identity without any secret", () => {
    setSessionStatus({
      status: "authenticated",
      user: { userId: "u1", email: "walis@example.com", name: "W" },
    });
    const s = getSessionStatus();
    expect(s.status).toBe("authenticated");
    if (s.status === "authenticated") {
      expect(s.user.userId).toBe("u1");
      expect(JSON.stringify(s)).not.toMatch(/token|secret|bearer|cookie/i);
    }
  });

  it("distinguishes unauthenticated from unreachable", () => {
    setSessionStatus({ status: "unauthenticated" });
    expect(getSessionStatus().status).toBe("unauthenticated");
    setSessionStatus({ status: "unreachable" });
    expect(getSessionStatus().status).toBe("unreachable");
  });

  it("resets to unknown", () => {
    setSessionStatus({ status: "authenticated", user: { userId: "u1" } });
    resetSessionStatus();
    expect(getSessionStatus()).toEqual({ status: "unknown" });
  });
});
