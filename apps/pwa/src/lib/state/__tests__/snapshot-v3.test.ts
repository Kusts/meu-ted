/**
 * RED (V4.1 Closure Phase 3, AUTH-T03..AUTH-T08 / INV-04 / INV-05 / INV-06):
 * offline snapshot V3 — identity-keyed envelope, migration, routing, TTL.
 *
 * Contract under test (snapshot-db.ts V3 API + snapshot-store.ts wrappers):
 * - V3 envelope schema 3, ownerKey = version + principal + workspace;
 * - reads NEVER use a bearer/token — only the validated principal/workspace;
 * - cross-user / cross-workspace reads return null without deleting the
 *   rightful owner's envelope (never heuristic attribution);
 * - V2→V3 migration ONLY with validated owner + safely readable V2,
 *   otherwise invalidate + re-sync;
 * - unreachable + valid V3 within TTL → offline read-only; 401/403 → login;
 * - expired age → locked (data kept for online revalidation);
 * - writes offline stay prohibited (INV-06 — no queue API may appear).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  writeV2Snapshot,
  readV2Snapshot,
  writeV3Snapshot,
  readV3Snapshot,
  deleteV3Snapshot,
  migrateV2toV3,
  getV3OfflineLockState,
  resolveUnreachableOfflineRoute,
  DB_NAME,
} from "../snapshot-db";
import {
  saveV3SnapshotDomain,
  loadV3SnapshotDomain,
} from "../snapshot-store";
import { decideRoute } from "@/lib/auth/auth-state-machine";
import { bindOfflineIdentity } from "@/lib/auth/offline-identity";

const USER_A = "user-a-001";
const USER_B = "user-b-002";
const WS_X = "11111111-2222-4333-8444-555555555555";
const WS_Y = "22222222-3333-4444-8555-666666666666";
const TOKEN_A = "token-for-user-a";
const ACCOUNTS = [{ id: "a1", name: "Conta A" }];

async function wipeDb(): Promise<void> {
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name) indexedDB.deleteDatabase(db.name);
  }
}

/** Craft a legacy (pre-subject, no age) V2 envelope straight into IndexedDB. */
async function seedLegacyV2(): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains("snapshots")) {
        open.result.createObjectStore("snapshots");
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("snapshots", "readwrite");
    tx.objectStore("snapshots").put(
      {
        schema: 2,
        ownerFingerprint: "fp-legacy",
        domains: { accounts: ACCOUNTS },
        syncedAt: { accounts: new Date().toISOString() },
      },
      "v2",
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

beforeEach(async () => {
  await wipeDb();
  localStorage.clear();
  bindOfflineIdentity(USER_A, WS_X);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("offline snapshot V3 (Phase 3)", () => {
  it("AUTH-T03: cookie-only identity roundtrips a V3 domain with zero bearer", async () => {
    await writeV3Snapshot(USER_A, WS_X, "accounts", ACCOUNTS as never);
    const loaded = await readV3Snapshot(USER_A, WS_X, "accounts");
    expect(loaded).not.toBeNull();
    expect(loaded!.data).toEqual(ACCOUNTS);
    expect(typeof loaded!.syncedAt).toBe("string");
  });

  it("AUTH-T06: user B cannot read user A's snapshot (envelope kept for A)", async () => {
    await writeV3Snapshot(USER_A, WS_X, "accounts", ACCOUNTS as never);
    expect(await readV3Snapshot(USER_B, WS_X, "accounts")).toBeNull();
    // No heuristic deletion: A's envelope survives B's miss.
    expect(await readV3Snapshot(USER_A, WS_X, "accounts")).not.toBeNull();
  });

  it("AUTH-T07: workspace Y cannot read workspace X snapshot (envelope kept for X)", async () => {
    await writeV3Snapshot(USER_A, WS_X, "accounts", ACCOUNTS as never);
    expect(await readV3Snapshot(USER_A, WS_Y, "accounts")).toBeNull();
    expect(await readV3Snapshot(USER_A, WS_X, "accounts")).not.toBeNull();
  });

  it("AUTH-T03: unreachable + valid V3 within TTL routes to offline read-only", async () => {
    await writeV3Snapshot(USER_A, WS_X, "accounts", ACCOUNTS as never);
    await expect(
      resolveUnreachableOfflineRoute(USER_A, WS_X),
    ).resolves.toBe("offline-read-only");
  });

  it("AUTH-T03: unreachable without a V3 snapshot routes to login (never false logout)", async () => {
    await expect(
      resolveUnreachableOfflineRoute(USER_A, WS_X),
    ).resolves.toBe("login");
  });

  it("AUTH-T04: an explicit 401 routes to login even with a valid snapshot (never offline)", async () => {
    await writeV3Snapshot(USER_A, WS_X, "accounts", ACCOUNTS as never);
    expect(decideRoute("unauthenticated", true)).toBe("login");
  });

  it("AUTH-T08: expired V3 age locks (read null, envelope kept, route login)", async () => {
    const eightyHoursAgo = new Date(Date.now() - 80 * 3_600_000).toISOString();
    await writeV3Snapshot(USER_A, WS_X, "accounts", ACCOUNTS as never, {
      lastOnlineAuthenticatedAt: eightyHoursAgo,
    });
    expect(await readV3Snapshot(USER_A, WS_X, "accounts")).toBeNull();
    const lock = await getV3OfflineLockState(USER_A, WS_X);
    expect(lock.state).toBe("locked");
    if (lock.state === "locked") expect(lock.reason).toBe("expired");
    await expect(
      resolveUnreachableOfflineRoute(USER_A, WS_X),
    ).resolves.toBe("login");
  });

  it("V2→V3 migration moves domains and invalidates V2 when ownership is proven", async () => {
    const { setOfflineSubjectId } = await import("@/lib/auth/offline-subject");
    setOfflineSubjectId(WS_X);
    await writeV2Snapshot(TOKEN_A, "accounts", ACCOUNTS as never);
    expect(await readV2Snapshot(TOKEN_A, "accounts")).not.toBeNull();

    const result = await migrateV2toV3({
      token: TOKEN_A,
      principalId: USER_A,
      workspaceId: WS_X,
    });
    expect(result.migrated).toBe(true);
    expect(await readV3Snapshot(USER_A, WS_X, "accounts")).not.toBeNull();
    // V2 source is invalidated after a proven migration.
    expect(await readV2Snapshot(TOKEN_A, "accounts")).toBeNull();
  });

  it("migration refuses a subject-mismatched V2 without touching either side", async () => {
    const { setOfflineSubjectId } = await import("@/lib/auth/offline-subject");
    setOfflineSubjectId(WS_X);
    await writeV2Snapshot(TOKEN_A, "accounts", ACCOUNTS as never);

    const result = await migrateV2toV3({
      token: TOKEN_A,
      principalId: USER_A,
      workspaceId: WS_Y,
    });
    expect(result.migrated).toBe(false);
    // Never assign X's snapshot to Y by heuristic…
    expect(await readV3Snapshot(USER_A, WS_Y, "accounts")).toBeNull();
    // …and never destroy the rightful owner's V2 either.
    expect(await readV2Snapshot(TOKEN_A, "accounts")).not.toBeNull();
  });

  it("migration invalidates a legacy V2 instead of attributing it", async () => {
    await seedLegacyV2();
    const result = await migrateV2toV3({
      token: TOKEN_A,
      principalId: USER_A,
      workspaceId: WS_X,
    });
    expect(result.migrated).toBe(false);
    expect(await readV3Snapshot(USER_A, WS_X, "accounts")).toBeNull();
    expect(await readV2Snapshot(TOKEN_A, "accounts")).toBeNull();
  });

  it("snapshot-store V3 wrappers roundtrip without a token", async () => {
    await saveV3SnapshotDomain(USER_A, WS_X, "budgets", [] as never);
    const loaded = await loadV3SnapshotDomain(USER_A, WS_X, "budgets");
    expect(loaded).not.toBeNull();
    await deleteV3Snapshot();
    expect(await loadV3SnapshotDomain(USER_A, WS_X, "budgets")).toBeNull();
  });

  it("kill-switch forces the unreachable route to login even with a valid V3", async () => {
    await writeV3Snapshot(USER_A, WS_X, "accounts", ACCOUNTS as never);
    vi.stubEnv("NEXT_PUBLIC_DISABLE_OFFLINE_SNAPSHOT", "1");
    await expect(
      resolveUnreachableOfflineRoute(USER_A, WS_X),
    ).resolves.toBe("login");
    expect(await readV3Snapshot(USER_A, WS_X, "accounts")).toBeNull();
  });
});
