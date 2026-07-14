import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { getToken, setToken } from "@/lib/auth/token-store";
import { clearSensitiveSession } from "./session";
import { writeV2Snapshot, readV2Snapshot } from "@/lib/state/snapshot-db";

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

  it("removes token, v1 snapshot, and profile; does NOT delete Cache Storage", async () => {
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

    await clearSensitiveSession({
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

  it("respects selective flags (only clears what is requested)", async () => {
    setToken("test-token-select");
    seedProfile();

    const memoryFn = vi.fn();

    await clearSensitiveSession({
      clearToken: false,
      clearV1Snapshot: false,
      clearProfile: true,
      clearMemory: memoryFn,
    });

    expect(getToken()).toBe("test-token-select");
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(memoryFn).toHaveBeenCalledOnce();
  });

  it("is idempotent (calling twice does not throw)", async () => {
    setToken("test-token-idem");
    seedProfile();

    await clearSensitiveSession({
      clearToken: true,
      clearV1Snapshot: true,
      clearProfile: true,
    });

    // Second call — should not throw
    await expect(
      clearSensitiveSession({
        clearToken: true,
        clearV1Snapshot: true,
        clearProfile: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("deletes v2 IndexedDB snapshot when clearV1Snapshot is true", async () => {
    setToken("v2-test-token");

    // Write a v2 snapshot
    await writeV2Snapshot("v2-test-token", "accounts", []);

    // Verify v2 data exists
    const before = await readV2Snapshot("v2-test-token", "accounts");
    expect(before).not.toBeNull();

    // Clear session — await ensures v2 delete completes
    await clearSensitiveSession({
      clearToken: true,
      clearV1Snapshot: true,
      clearProfile: false,
    });

    // v2 data should be gone immediately (awaited)
    const after = await readV2Snapshot("v2-test-token", "accounts");
    expect(after).toBeNull();
  });

  it("completes cleanup BEFORE caller resumes (async ordering proof)", async () => {
    // Prove that after await clearSensitiveSession returns, all data is gone
    // INCLUDING v2 IndexedDB.
    setToken("order-token");
    seedSnapshot("order-token");
    seedProfile();
    await writeV2Snapshot("order-token", "accounts", []);

    let cleanupVerified = false;

    await clearSensitiveSession({
      clearToken: true,
      clearV1Snapshot: true,
      clearProfile: true,
    });

    // This line executes AFTER cleanup completes (await resolved)
    cleanupVerified = true;

    expect(cleanupVerified).toBe(true);
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(SNAPSHOT_KEY)).toBeNull();
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();

    // v2 also deleted (awaited)
    const v2After = await readV2Snapshot("order-token", "accounts");
    expect(v2After).toBeNull();
  });

  it("attempts every store independently — a v2 failure does not abort the others", async () => {
    setToken("indep-token");
    seedProfile();
    seedSnapshot("indep-token");

    const db = await import("@/lib/state/snapshot-db");
    const v2Fail = vi
      .spyOn(db, "deleteV2Snapshot")
      .mockRejectedValue(new Error("idb down"));

    await clearSensitiveSession({
      clearToken: true,
      clearV1Snapshot: true,
      clearProfile: true,
      clearMemory: vi.fn(),
    });

    // token / profile / v1 still cleared even though v2 delete rejected.
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(localStorage.getItem(SNAPSHOT_KEY)).toBeNull();
    expect(v2Fail).toHaveBeenCalled();
  });

  it("resolves (no unhandled rejection) even when a store throws", async () => {
    setToken("throw-token");
    seedSnapshot("throw-token");
    const db = await import("@/lib/state/snapshot-db");
    vi.spyOn(db, "deleteV2Snapshot").mockRejectedValue(new Error("idb down"));

    // Must resolve (no thrown rejection) even with a failing store.
    await expect(
      clearSensitiveSession({ clearToken: true, clearV1Snapshot: true }),
    ).resolves.toBeUndefined();
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(SNAPSHOT_KEY)).toBeNull();
  });
});
