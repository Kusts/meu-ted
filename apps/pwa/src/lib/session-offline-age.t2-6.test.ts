/**
 * T2.6 RED — session-level lastOnlineAuthenticatedAt stamp (SPEC §10 D1).
 *
 * Baseline: session.ts has no stamp helpers. Fails until
 * stamp/get/clear exist and logout (clearToken) clears the stamp.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  stampLastOnlineAuthenticatedAt,
  getLastOnlineAuthenticatedAt,
  clearLastOnlineAuthenticatedAt,
  LAST_ONLINE_AUTH_STORAGE_KEY,
  clearSensitiveSession,
} from "./session";

describe("T2.6 session offline-auth stamp (RED on baseline)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("unstamped session reads null (no implicit trust)", () => {
    expect(getLastOnlineAuthenticatedAt()).toBeNull();
  });

  it("stamp persists an ISO instant, re-stamp refreshes it", () => {
    stampLastOnlineAuthenticatedAt("2026-09-10T10:00:00.000Z");
    expect(getLastOnlineAuthenticatedAt()).toBe("2026-09-10T10:00:00.000Z");
    expect(localStorage.getItem(LAST_ONLINE_AUTH_STORAGE_KEY)).toBe(
      "2026-09-10T10:00:00.000Z",
    );
    stampLastOnlineAuthenticatedAt("2026-09-16T10:00:00.000Z");
    expect(getLastOnlineAuthenticatedAt()).toBe("2026-09-16T10:00:00.000Z");
  });

  it("stamp defaults to now when no instant is given", () => {
    const before = Date.now();
    stampLastOnlineAuthenticatedAt();
    const stored = getLastOnlineAuthenticatedAt();
    expect(stored).not.toBeNull();
    const parsed = Date.parse(stored!);
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("rejects invalid instants without writing (fail-closed)", () => {
    stampLastOnlineAuthenticatedAt("not-a-date");
    expect(getLastOnlineAuthenticatedAt()).toBeNull();
    expect(localStorage.getItem(LAST_ONLINE_AUTH_STORAGE_KEY)).toBeNull();
  });

  it("logout with token cleanup clears the stamp (XLT-09 unit pin)", async () => {
    stampLastOnlineAuthenticatedAt("2026-09-16T10:00:00.000Z");
    await clearSensitiveSession({ clearToken: true });
    expect(getLastOnlineAuthenticatedAt()).toBeNull();
  });

  it("clear helper removes the stamp", () => {
    stampLastOnlineAuthenticatedAt("2026-09-16T10:00:00.000Z");
    clearLastOnlineAuthenticatedAt();
    expect(getLastOnlineAuthenticatedAt()).toBeNull();
  });
});
