import { describe, it, expect, beforeEach } from "vitest";
import {
  getOfflineSubjectId,
  setOfflineSubjectId,
  clearOfflineSubjectId,
  OFFLINE_SUBJECT_STORAGE_KEY,
} from "./offline-subject";
import { setToken, setSessionToken } from "./token-store";

const UUID_A = "11111111-1111-4111-8111-111111111111";

/**
 * T2.2 B4 / D-V4-11 — offlineSubjectId: id do workspace/household ativo,
 * UUID opaco, NÃO-credencial, nunca derivado de token.
 */
describe("offlineSubjectId (V4 T2.2 B4/D-V4-11)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists an opaque UUID subject under a dedicated key", () => {
    expect(setOfflineSubjectId(UUID_A)).toBe(true);
    expect(localStorage.getItem(OFFLINE_SUBJECT_STORAGE_KEY)).toBe(UUID_A);
    expect(getOfflineSubjectId()).toBe(UUID_A);
  });

  it("survives a reload (durable localStorage store, no in-memory-only state)", () => {
    setOfflineSubjectId(UUID_A);
    // Reload = same localStorage, fresh read path (no module cache involved).
    const raw = localStorage.getItem(OFFLINE_SUBJECT_STORAGE_KEY);
    expect(raw).toBe(UUID_A);
    expect(getOfflineSubjectId()).toBe(raw);
  });

  it("is never equal to a session or device bearer", () => {
    setToken("dev-legacy-token-abc");
    setSessionToken("sess-legacy-token-xyz");
    setOfflineSubjectId(UUID_A);
    const subject = getOfflineSubjectId();
    expect(subject).toBe(UUID_A);
    expect(subject).not.toBe("dev-legacy-token-abc");
    expect(subject).not.toBe("sess-legacy-token-xyz");
  });

  it("stores only the id — never credential material", () => {
    setToken("dev-legacy-token-abc");
    setOfflineSubjectId(UUID_A);
    const raw = localStorage.getItem(OFFLINE_SUBJECT_STORAGE_KEY) ?? "";
    expect(raw).toBe(UUID_A);
    expect(raw).not.toContain("dev-legacy-token-abc");
    expect(raw).not.toContain("Bearer");
  });

  it("rejects non-UUID values without writing anything", () => {
    expect(setOfflineSubjectId("mock-workspace")).toBe(false);
    expect(setOfflineSubjectId("not-a-uuid")).toBe(false);
    expect(setOfflineSubjectId("")).toBe(false);
    expect(localStorage.getItem(OFFLINE_SUBJECT_STORAGE_KEY)).toBeNull();
    expect(getOfflineSubjectId()).toBeNull();
  });

  it("clears the subject on demand", () => {
    setOfflineSubjectId(UUID_A);
    clearOfflineSubjectId();
    expect(getOfflineSubjectId()).toBeNull();
    expect(localStorage.getItem(OFFLINE_SUBJECT_STORAGE_KEY)).toBeNull();
  });
});
