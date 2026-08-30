import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetLocalSession } from "./reset-session";
import * as sessionModule from "./session";

describe("resetLocalSession", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });

  it("calls clearSensitiveSession with all flags on", async () => {
    const spy = vi.spyOn(sessionModule, "clearSensitiveSession").mockResolvedValue(undefined);
    await resetLocalSession();
    expect(spy).toHaveBeenCalledWith({
      clearToken: true,
      clearV1Snapshot: true,
      clearProfile: true,
    });
  });

  it("removes legacy PIN keys from localStorage", async () => {
    vi.spyOn(sessionModule, "clearSensitiveSession").mockResolvedValue(undefined);
    localStorage.setItem("pi-finance:pin-hash", "abc");
    localStorage.setItem("pi-finance:pin-salt", "def");
    localStorage.setItem("pi-finance:pin", "1234");
    await resetLocalSession();
    expect(localStorage.getItem("pi-finance:pin-hash")).toBeNull();
    expect(localStorage.getItem("pi-finance:pin-salt")).toBeNull();
    expect(localStorage.getItem("pi-finance:pin")).toBeNull();
  });

  it("does not throw when localStorage.removeItem fails", async () => {
    vi.spyOn(sessionModule, "clearSensitiveSession").mockResolvedValue(undefined);
    const originalRemoveItem = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = vi.fn((key: string) => {
      if (key === "pi-finance:pin-hash") throw new Error("quota");
      originalRemoveItem(key);
    });
    await expect(resetLocalSession()).resolves.toBeUndefined();
    // pin-salt and pin should still have been removed
    expect(localStorage.getItem("pi-finance:pin-salt")).toBeNull();
    localStorage.removeItem = originalRemoveItem;
  });

  it("awaits IndexedDB cleanup before resolving", async () => {
    let resolved = false;
    vi.spyOn(sessionModule, "clearSensitiveSession").mockImplementation(async () => {
      // Simulate async IndexedDB work
      await new Promise((r) => setTimeout(r, 5));
    });
    const promise = resetLocalSession().then(() => { resolved = true; });
    expect(resolved).toBe(false);
    await promise;
    expect(resolved).toBe(true);
  });
});
