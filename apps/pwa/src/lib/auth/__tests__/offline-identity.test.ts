/**
 * RED (V4.1 Closure Phase 3, AUTH-02 / INV-03 / INV-04):
 * non-authenticator offline identity — principal + workspace binding.
 *
 * Contract under test (apps/pwa/src/lib/auth/offline-identity.ts):
 * - persisted ONLY after valid online auth (callers bind from the
 *   server-confirmed session identity, never from bearer/device/cookie);
 * - opaque, non-secret identifiers; ownerKey = version + principal + workspace;
 * - fail-closed setters (empty principal / non-UUID workspace refused);
 * - workspace-switch clears the binding but keeps the user principal
 *   (AUTH-T07); logout clears everything (AUTH-T06).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  getOfflinePrincipalId,
  setOfflinePrincipalId,
  getOfflineWorkspaceId,
  setOfflineWorkspaceId,
  bindOfflineIdentity,
  clearOfflineIdentity,
  clearOfflineWorkspaceBinding,
  computeOwnerKey,
  OFFLINE_PRINCIPAL_STORAGE_KEY,
  OFFLINE_WORKSPACE_STORAGE_KEY,
} from "../offline-identity";
import {
  getOfflineSubjectId,
  setOfflineSubjectId,
} from "../offline-subject";

const USER_A = "user-a-001";
const USER_B = "user-b-002";
const WS_X = "11111111-2222-4333-8444-555555555555";
const WS_Y = "22222222-3333-4444-8555-666666666666";

beforeEach(() => {
  localStorage.clear();
});

describe("offline identity (AUTH-02)", () => {
  it("bind persists principal + workspace and derives a stable ownerKey", () => {
    expect(bindOfflineIdentity(USER_A, WS_X)).toBe(true);
    expect(getOfflinePrincipalId()).toBe(USER_A);
    expect(getOfflineWorkspaceId()).toBe(WS_X);
    expect(computeOwnerKey(USER_A, WS_X)).toBe(
      computeOwnerKey(USER_A, WS_X),
    );
    expect(typeof computeOwnerKey(USER_A, WS_X)).toBe("string");
  });

  it("ownerKey differs per user and per workspace (INV-04)", () => {
    expect(computeOwnerKey(USER_A, WS_X)).not.toBe(
      computeOwnerKey(USER_B, WS_X),
    );
    expect(computeOwnerKey(USER_A, WS_X)).not.toBe(
      computeOwnerKey(USER_A, WS_Y),
    );
  });

  it("fail-closed setters refuse empty principal / non-UUID workspace", () => {
    expect(setOfflinePrincipalId("")).toBe(false);
    expect(setOfflineWorkspaceId("not-a-uuid")).toBe(false);
    expect(bindOfflineIdentity("", WS_X)).toBe(false);
    expect(bindOfflineIdentity(USER_A, "not-a-uuid")).toBe(false);
    expect(getOfflinePrincipalId()).toBeNull();
    expect(getOfflineWorkspaceId()).toBeNull();
    expect(localStorage.getItem(OFFLINE_PRINCIPAL_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(OFFLINE_WORKSPACE_STORAGE_KEY)).toBeNull();
  });

  it("identity keys are distinct from bearer/token stores (INV-03)", () => {
    bindOfflineIdentity(USER_A, WS_X);
    expect(OFFLINE_PRINCIPAL_STORAGE_KEY).not.toContain("token");
    expect(OFFLINE_WORKSPACE_STORAGE_KEY).not.toContain("token");
    expect(localStorage.getItem("pi-finance:token")).toBeNull();
    expect(localStorage.getItem("pi-finance:session-token")).toBeNull();
  });

  it("clearOfflineIdentity removes principal + workspace + subject (logout, AUTH-T06)", () => {
    bindOfflineIdentity(USER_A, WS_X);
    setOfflineSubjectId(WS_X);
    clearOfflineIdentity();
    expect(getOfflinePrincipalId()).toBeNull();
    expect(getOfflineWorkspaceId()).toBeNull();
    expect(getOfflineSubjectId()).toBeNull();
  });

  it("clearOfflineWorkspaceBinding keeps principal, clears workspace + subject (switch, AUTH-T07)", () => {
    bindOfflineIdentity(USER_A, WS_X);
    setOfflineSubjectId(WS_X);
    clearOfflineWorkspaceBinding();
    expect(getOfflinePrincipalId()).toBe(USER_A);
    expect(getOfflineWorkspaceId()).toBeNull();
    expect(getOfflineSubjectId()).toBeNull();
  });
});
