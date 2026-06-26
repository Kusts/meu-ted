import { describe, it, expect, beforeEach } from "vitest";
import { saveDomain, loadDomain, clearSnapshot } from "../snapshot-store";
import type { Account } from "../types";

const acc: Account = {
  id: "a1",
  name: "Backend Nubank",
  kind: "checking",
  balanceCents: 1000,
  status: "active",
};

describe("snapshot-store", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing saved", () => {
    expect(loadDomain("tok", "accounts")).toBeNull();
  });

  it("round-trips a domain stamped with syncedAt for the same token", () => {
    saveDomain("tok", "accounts", [acc]);
    const got = loadDomain("tok", "accounts");
    expect(got?.data).toEqual([acc]);
    expect(typeof got?.syncedAt).toBe("string");
  });

  it("does NOT return a snapshot saved under a different token", () => {
    saveDomain("tok-A", "accounts", [acc]);
    expect(loadDomain("tok-B", "accounts")).toBeNull();
  });

  it("discards prior snapshot when the token changes on save", () => {
    saveDomain("tok-A", "accounts", [acc]);
    saveDomain("tok-B", "categories", []);
    // tok-B save replaced the envelope; tok-A data is gone
    expect(loadDomain("tok-A", "accounts")).toBeNull();
  });

  it("clearSnapshot wipes everything", () => {
    saveDomain("tok", "accounts", [acc]);
    clearSnapshot();
    expect(loadDomain("tok", "accounts")).toBeNull();
  });
});
