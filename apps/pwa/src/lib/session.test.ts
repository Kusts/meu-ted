import { describe, it, expect, vi, beforeEach } from "vitest";
import { getToken, setToken } from "@/lib/auth/token-store";
import { clearSensitiveSession } from "./session";

const SNAPSHOT_KEY = "pi-finance:snapshot:v1";
const PROFILE_KEY = "pi-finance:profile";

function seedSnapshot(token: string) {
  localStorage.setItem(
    SNAPSHOT_KEY,
    JSON.stringify({
      version: 1,
      token,
      syncedAt: { accounts: "2026-07-13T00:00:00.000Z" },
      data: { accounts: [] },
    }),
  );
}

function seedProfile() {
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({
      householdId: "hh-test",
      name: "Test User",
      email: "",
      phone: "",
      avatarColor: "#0E8C5A",
      greetingStyle: "auto",
      updatedAt: "2026-07-13T00:00:00.000Z",
    }),
  );
}

describe("clearSensitiveSession", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("removes token, v1 snapshot, and profile; does NOT delete Cache Storage", () => {
    setToken("test-token-sec");
    seedSnapshot("test-token-sec");
    seedProfile();

    expect(getToken()).toBe("test-token-sec");
    expect(localStorage.getItem(SNAPSHOT_KEY)).not.toBeNull();
    expect(localStorage.getItem(PROFILE_KEY)).not.toBeNull();

    const cacheSpy =
      typeof CacheStorage !== "undefined"
        ? vi.spyOn(CacheStorage.prototype, "delete")
        : undefined;

    clearSensitiveSession({
      clearToken: true,
      clearV1Snapshot: true,
      clearProfile: true,
      clearMemory: vi.fn(),
    });

    expect(getToken()).toBeNull();
    expect(localStorage.getItem(SNAPSHOT_KEY)).toBeNull();
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();

    if (cacheSpy !== undefined) {
      expect(cacheSpy).not.toHaveBeenCalled();
    }
  });

  it("respects selective flags (only clears what is requested)", () => {
    setToken("test-token-select");
    seedProfile();

    const memoryFn = vi.fn();

    clearSensitiveSession({
      clearToken: false,
      clearV1Snapshot: false,
      clearProfile: true,
      clearMemory: memoryFn,
    });

    expect(getToken()).toBe("test-token-select");
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(memoryFn).toHaveBeenCalledOnce();
  });

  it("is idempotent (calling twice does not throw)", () => {
    setToken("test-token-idem");
    seedProfile();

    clearSensitiveSession({
      clearToken: true,
      clearV1Snapshot: true,
      clearProfile: true,
    });

    expect(() =>
      clearSensitiveSession({
        clearToken: true,
        clearV1Snapshot: true,
        clearProfile: true,
      }),
    ).not.toThrow();
  });

  it("completes cleanup BEFORE caller resumes (sync ordering)", () => {
    // Prove that after clearSensitiveSession returns, all data is gone.
    // No async gap: cleanup runs synchronously, caller code after the call
    // is guaranteed to execute AFTER all storage mutations.
    setToken("order-token");
    seedSnapshot("order-token");
    seedProfile();

    let cleanupVerified = false;

    clearSensitiveSession({
      clearToken: true,
      clearV1Snapshot: true,
      clearProfile: true,
    });

    // This line executes AFTER cleanup completes (synchronous call)
    cleanupVerified = true;

    expect(cleanupVerified).toBe(true);
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(SNAPSHOT_KEY)).toBeNull();
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
  });
});
