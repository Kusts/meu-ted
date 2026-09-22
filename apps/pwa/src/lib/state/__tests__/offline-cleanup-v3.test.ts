/**
 * RED (V4.1 Closure Phase 3, AUTH-T04..AUTH-T07 / INV-05):
 * offline cleanup — logout/revocation/workspace-switch purge the V3
 * snapshot, the offline identity and the age stamp per case.
 *
 * Contract under test (clearSensitiveSession in session.ts):
 * - logout/401/403 (clearToken + clearV1Snapshot + clearOfflineIdentity):
 *   V3 gone, principal + workspace + subject + stamp gone (AUTH-T04/05/06);
 * - workspace switch (clearV1Snapshot + clearWorkspaceBinding, no token
 *   clear): V3 gone, workspace + subject + stamp gone, user principal KEPT
 *   (AUTH-T07 — closes the workspace-context.tsx:298-313 gap);
 * - snapshot purge always includes V3 (backstop via clearV1Snapshot).
 */
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { clearSensitiveSession, getLastOnlineAuthenticatedAt } from "@/lib/session";
import { writeV3Snapshot, readV3Snapshot } from "../snapshot-db";
import {
  bindOfflineIdentity,
  getOfflinePrincipalId,
  getOfflineWorkspaceId,
} from "@/lib/auth/offline-identity";
import {
  getOfflineSubjectId,
  setOfflineSubjectId,
} from "@/lib/auth/offline-subject";
import { stampLastOnlineAuthenticatedAt } from "@/lib/session";

const USER_A = "user-a-001";
const WS_X = "11111111-2222-4333-8444-555555555555";
const ACCOUNTS = [{ id: "a1", name: "Conta A" }];

async function wipeDb(): Promise<void> {
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name) indexedDB.deleteDatabase(db.name);
  }
}

async function seedOnlineSession(): Promise<void> {
  bindOfflineIdentity(USER_A, WS_X);
  setOfflineSubjectId(WS_X);
  stampLastOnlineAuthenticatedAt();
  await writeV3Snapshot(USER_A, WS_X, "accounts", ACCOUNTS as never);
  expect(await readV3Snapshot(USER_A, WS_X, "accounts")).not.toBeNull();
  expect(getLastOnlineAuthenticatedAt()).not.toBeNull();
}

beforeEach(async () => {
  await wipeDb();
  localStorage.clear();
});

describe("offline cleanup (Phase 3)", () => {
  it("AUTH-T04/05/06: logout purge removes V3 + principal + workspace + subject + stamp", async () => {
    await seedOnlineSession();
    await clearSensitiveSession({
      clearToken: true,
      clearV1Snapshot: true,
      clearProfile: true,
      clearOfflineIdentity: true,
    });
    expect(await readV3Snapshot(USER_A, WS_X, "accounts")).toBeNull();
    expect(getOfflinePrincipalId()).toBeNull();
    expect(getOfflineWorkspaceId()).toBeNull();
    expect(getOfflineSubjectId()).toBeNull();
    expect(getLastOnlineAuthenticatedAt()).toBeNull();
  });

  it("AUTH-T07: workspace switch clears binding + V3 + stamp but keeps the user principal", async () => {
    await seedOnlineSession();
    await clearSensitiveSession({
      clearV1Snapshot: true,
      clearProfile: true,
      clearWorkspaceBinding: true,
    });
    expect(await readV3Snapshot(USER_A, WS_X, "accounts")).toBeNull();
    expect(getOfflineWorkspaceId()).toBeNull();
    expect(getOfflineSubjectId()).toBeNull();
    expect(getLastOnlineAuthenticatedAt()).toBeNull();
    // The user did not log out: the principal survives for rebinding.
    expect(getOfflinePrincipalId()).toBe(USER_A);
  });

  it("snapshot purge always includes V3 (backstop)", async () => {
    await seedOnlineSession();
    await clearSensitiveSession({ clearV1Snapshot: true });
    expect(await readV3Snapshot(USER_A, WS_X, "accounts")).toBeNull();
  });
});
