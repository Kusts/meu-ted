// Profile adapter tests — characterizes saveProfile public projection and
// error semantics. The adapter handles API persistence and local fallback.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createProfileAdapter } from "./profile-adapter";
import * as endpoints from "@/lib/api/endpoints";
import type { Profile } from "./types";

const MOCK_PROFILE: Profile = {
  householdId: "hh-test",
  name: "Marina",
  email: "",
  phone: "",
  avatarColor: "#0E8C5A",
  greetingStyle: "auto",
  updatedAt: "2026-07-13T00:00:00.000Z",
};

const PROFILE_KEY = "pi-finance:profile";

describe("profile adapter — saveProfile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // ── API mode (apiUsable = true) ────────────────────────────────
  it("save with API: calls patchProfile and returns projected result", async () => {
    const patched = { ...MOCK_PROFILE, name: "Marina Silva", updatedAt: "2026-07-14T00:00:00.000Z" };
    const spy = vi.spyOn(endpoints, "patchProfile").mockResolvedValue(patched as never);

    const adapter = createProfileAdapter({ apiUsable: true });
    const result = await adapter.save({ name: "Marina Silva" }, MOCK_PROFILE);

    expect(spy).toHaveBeenCalledWith({ name: "Marina Silva" });
    expect(result).toEqual(patched);
  });

  it("save with API: propagates API error", async () => {
    vi.spyOn(endpoints, "patchProfile").mockRejectedValue(new Error("Network error"));
    const adapter = createProfileAdapter({ apiUsable: true });
    await expect(adapter.save({ name: "X" }, MOCK_PROFILE)).rejects.toThrow("Network error");
  });

  // ── Local mode (apiUsable = false) ──────────────────────────────
  it("save without API: applies defaults and sets updatedAt", async () => {
    const adapter = createProfileAdapter({ apiUsable: false });
    const result = await adapter.save({ name: "Marina" }, null);
    expect(result.name).toBe("Marina");
    expect(result.email).toBe("");
    expect(result.phone).toBe("");
    expect(result.avatarColor).toBe("#0E8C5A");
    expect(result.greetingStyle).toBe("auto");
    expect(result.householdId).toBe("local-household");
    expect(result.updatedAt).toBeTruthy();
  });

  it("save without API: merges with current profile", async () => {
    const adapter = createProfileAdapter({ apiUsable: false });
    const result = await adapter.save({ email: "m@example.com" }, MOCK_PROFILE);
    expect(result.name).toBe(MOCK_PROFILE.name); // preserved from current
    expect(result.email).toBe("m@example.com");  // overridden
  });

  it("save without API: does not call endpoints", async () => {
    const spy = vi.spyOn(endpoints, "patchProfile");
    const adapter = createProfileAdapter({ apiUsable: false });
    await adapter.save({ name: "Test" }, null);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("profile adapter — refreshProfile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("refresh calls fetchProfile and returns result", async () => {
    vi.spyOn(endpoints, "fetchProfile").mockResolvedValue(MOCK_PROFILE as never);
    const adapter = createProfileAdapter({ apiUsable: true });
    const result = await adapter.refresh();
    expect(result).toEqual(MOCK_PROFILE);
  });

  it("refresh when apiUsable=false returns null", async () => {
    const spy = vi.spyOn(endpoints, "fetchProfile");
    const adapter = createProfileAdapter({ apiUsable: false });
    const result = await adapter.refresh();
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("profile adapter — hydrate (local-only)", () => {
  beforeEach(() => { localStorage.clear(); });

  it("returns null when no local profile", () => {
    const adapter = createProfileAdapter({ apiUsable: false });
    expect(adapter.hydrate()).toBeNull();
  });

  it("returns parsed profile when localStorage has data", () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(MOCK_PROFILE));
    const adapter = createProfileAdapter({ apiUsable: false });
    expect(adapter.hydrate()).toEqual(MOCK_PROFILE);
  });
});

describe("profile adapter — persist (local-only)", () => {
  beforeEach(() => { localStorage.clear(); });

  it("writes profile to localStorage", () => {
    const adapter = createProfileAdapter({ apiUsable: false });
    adapter.persist(MOCK_PROFILE);
    const raw = localStorage.getItem(PROFILE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toMatchObject({ name: "Marina" });
  });
});
