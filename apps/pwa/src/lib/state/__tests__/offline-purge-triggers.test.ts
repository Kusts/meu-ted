import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readV2Snapshot,
  writeV2Snapshot,
  getOfflineSnapshotLockState,
} from "../snapshot-db";
import { setOfflineSubjectId } from "@/lib/auth/offline-subject";
import { clearSensitiveSession } from "@/lib/session";

/**
 * V4.1 Phase 5 (Task 5.9 + D10) purge-trigger map:
 * - logout → purge (clearToken + clearV1Snapshot path);
 * - workspace-switch → purge (covered in workspace-context.test.tsx
 *   "selects the first authorized workspace…", asserting the previous
 *   snapshot reads null after the switch);
 * - membership revocation → purge (covered in
 *   api/__tests__/revocation-purge.test.ts + bootstrap-revocation.test.ts);
 * - optional disable via NEXT_PUBLIC_DISABLE_OFFLINE_SNAPSHOT (here).
 */
const TOKEN = "purge-map-token";
const SUBJECT = "44444444-5555-4666-8777-888888888888";

describe("offline purge-trigger map (D10)", () => {
  beforeEach(async () => {
    localStorage.clear();
    const dbs = await indexedDB.databases();
    for (const db of dbs) if (db.name) indexedDB.deleteDatabase(db.name);
    setOfflineSubjectId(SUBJECT);
    await writeV2Snapshot(TOKEN, "accounts", [{ id: "a1" }] as never);
    expect(await readV2Snapshot(TOKEN, "accounts")).not.toBeNull();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logout purges the offline snapshot", async () => {
    await clearSensitiveSession({ clearToken: true, clearV1Snapshot: true, clearProfile: true });
    expect(await readV2Snapshot(TOKEN, "accounts")).toBeNull();
  });

  it("disabled snapshot flag blocks writes and reports empty lock state", async () => {
    vi.stubEnv("NEXT_PUBLIC_DISABLE_OFFLINE_SNAPSHOT", "1");
    const dbs = await indexedDB.databases();
    for (const db of dbs) if (db.name) indexedDB.deleteDatabase(db.name);
    await writeV2Snapshot(TOKEN, "accounts", [{ id: "a1" }] as never);
    expect(await readV2Snapshot(TOKEN, "accounts")).toBeNull();
    expect(await getOfflineSnapshotLockState()).toEqual({ state: "empty" });
  });

  it("enabled snapshot flag keeps the normal write/read path", async () => {
    vi.stubEnv("NEXT_PUBLIC_DISABLE_OFFLINE_SNAPSHOT", "0");
    await writeV2Snapshot(TOKEN, "budgets", [] as never);
    expect(await readV2Snapshot(TOKEN, "budgets")).not.toBeNull();
  });
});
