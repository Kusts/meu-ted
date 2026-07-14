/**
 * Snapshot DB tests — IndexedDB v2 snapshot.
 *
 * NOTE: These tests use fake-indexeddb for a simulated IndexedDB environment.
 * In vitest, fake-indexeddb must be polyfilled globally before imports.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// Polyfill IndexedDB with fake-indexeddb
import "fake-indexeddb/auto";
import {
  openSnapshotDb,
  writeV2Snapshot,
  readV2Snapshot,
  deleteV2Snapshot,
  migrateV1toV2,
  V2_ENVELOPE_KEY,
  DB_NAME,
  STORE_NAME,
} from "./snapshot-db";
import type { DomainKey } from "./snapshot-store";

// Restore any spies (e.g. the interrupted-migration test mocks openSnapshotDb)
// so they never leak into later tests in the same file.
afterEach(() => vi.restoreAllMocks());

const TEST_TOKEN = "test-token-abc";
const TEST_DOMAIN: DomainKey = "accounts";

// Seed v1 localStorage
function seedV1(token: string): void {
  localStorage.setItem(
    "pi-finance:snapshot:v1",
    JSON.stringify({
      version: 1,
      token,
      syncedAt: { accounts: "2026-07-13T00:00:00.000Z" },
      data: { accounts: [{ id: "a1", name: "Seed Account" }] },
    }),
  );
}

function corruptV1(): void {
  localStorage.setItem("pi-finance:snapshot:v1", "not-json");
}

describe("v2 snapshot — database lifecycle", () => {
  beforeEach(async () => {
    // Clean IndexedDB between tests
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
    localStorage.clear();
  });

  it("reads and writes a v2 envelope", async () => {
    await writeV2Snapshot(TEST_TOKEN, TEST_DOMAIN, [
      { id: "a1", name: "Nubank" },
    ] as never);

    const result = await readV2Snapshot(TEST_TOKEN, TEST_DOMAIN);
    expect(result).not.toBeNull();
    expect(result!.data).toHaveLength(1);
    expect(result!.syncedAt).toBeTruthy();
  });

  it("returns null on owner mismatch (different token)", async () => {
    await writeV2Snapshot(TEST_TOKEN, TEST_DOMAIN, [] as never);

    const result = await readV2Snapshot("different-token", TEST_DOMAIN);
    expect(result).toBeNull();
  });

  it("deletes the v2 snapshot", async () => {
    await writeV2Snapshot(TEST_TOKEN, TEST_DOMAIN, [] as never);
    await deleteV2Snapshot();

    const result = await readV2Snapshot(TEST_TOKEN, TEST_DOMAIN);
    expect(result).toBeNull();
  });

  it("database opens and has correct schema", async () => {
    const db = await openSnapshotDb();
    expect(db.name).toBe(DB_NAME);
    expect(db.objectStoreNames).toContain(STORE_NAME);
    db.close();
  });
});

describe("v2 snapshot — v1 migration", () => {
  beforeEach(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
    localStorage.clear();
  });

  it("migrates v1 data to v2 and deletes v1", async () => {
    seedV1(TEST_TOKEN);

    await migrateV1toV2(TEST_TOKEN);

    // v1 should be gone
    expect(localStorage.getItem("pi-finance:snapshot:v1")).toBeNull();

    // v2 should have the data
    const result = await readV2Snapshot(TEST_TOKEN, "accounts");
    expect(result).not.toBeNull();
    expect(result!.data).toHaveLength(1);
    expect((result!.data as unknown[])[0]).toMatchObject({
      id: "a1",
      name: "Seed Account",
    });
  });

  it("deletes corrupted v1 without migration", async () => {
    corruptV1();

    // Should not throw — silently handle corruption
    await migrateV1toV2(TEST_TOKEN);

    expect(localStorage.getItem("pi-finance:snapshot:v1")).toBeNull();
  });

  it("deletes v2 on owner mismatch (wrong token)", async () => {
    seedV1("token-a");
    await migrateV1toV2("token-different");

    // v2 should either not exist or be deleted
    const result = await readV2Snapshot("token-a", "accounts");
    expect(result).toBeNull();
  });

  it("interrupted migration (v2 written but v1 not deleted) — idempotent", async () => {
    seedV1(TEST_TOKEN);

    // Simulate: v2 written, v1 still exists
    await writeV2Snapshot(TEST_TOKEN, "accounts", [
      { id: "a1", name: "Seed Account" },
    ] as never);

    // Call migration again — should delete v1 and still work
    await migrateV1toV2(TEST_TOKEN);

    expect(localStorage.getItem("pi-finance:snapshot:v1")).toBeNull();
    const result = await readV2Snapshot(TEST_TOKEN, "accounts");
    expect(result).not.toBeNull();
  });

  it("preserves v1 when v2 write is interrupted (IndexedDB unavailable)", async () => {
    seedV1(TEST_TOKEN);
    // Make every IndexedDB open fail — this affects openSnapshotDb's internal
    // callers (read/write/delete), so a write failure during migration must
    // not delete the only copy of the data (v1).
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new Error("db down");
    });

    await migrateV1toV2(TEST_TOKEN);

    // The only copy of the data (v1) must survive an interrupted migration.
    expect(localStorage.getItem("pi-finance:snapshot:v1")).not.toBeNull();
  });
});

describe("v2 snapshot — edge cases", () => {
  beforeEach(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
    localStorage.clear();
  });

  it("returns null when no v2 data exists", async () => {
    const result = await readV2Snapshot(TEST_TOKEN, "accounts");
    expect(result).toBeNull();
  });

  it("idempotent delete", async () => {
    await deleteV2Snapshot();
    await deleteV2Snapshot(); // second call should not throw
    expect(true).toBe(true);
  });

  it("writes to existing envelope (same token fingerprint)", async () => {
    await writeV2Snapshot(TEST_TOKEN, "accounts", [{ id: "a1" }] as never);
    await writeV2Snapshot(
      TEST_TOKEN,
      "categories",
      [{ id: "c1", name: "Food", kind: "expense", icon: "Tag" }] as never,
    );

    const accounts = await readV2Snapshot(TEST_TOKEN, "accounts");
    const categories = await readV2Snapshot(TEST_TOKEN, "categories");
    expect(accounts).not.toBeNull();
    expect(categories).not.toBeNull();
    expect((accounts!.data as unknown[])[0]).toMatchObject({ id: "a1" });
  });

  it("returns null for wrong schema version", async () => {
    // Directly corrupt the envelope schema
    const db = await openSnapshotDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({
        schema: 999,
        ownerFingerprint: "x",
        domains: {},
        syncedAt: {},
      }, V2_ENVELOPE_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });

    const result = await readV2Snapshot(TEST_TOKEN, "accounts");
    expect(result).toBeNull();
  });

  it("migration preserves v1 on owner mismatch (belongs to another session)", async () => {
    seedV1("token-a");
    await migrateV1toV2("token-different");

    // v1 must be preserved — it belongs to token-a, not the active session.
    expect(localStorage.getItem("pi-finance:snapshot:v1")).not.toBeNull();
    // No v2 written for either token.
    const resultA = await readV2Snapshot("token-a", "accounts");
    const resultB = await readV2Snapshot("token-different", "accounts");
    expect(resultA).toBeNull();
    expect(resultB).toBeNull();
  });

  it("migrates only valid v1 (ignores v1 without token)", async () => {
    localStorage.setItem(
      "pi-finance:snapshot:v1",
      JSON.stringify({ version: 1, syncedAt: {}, data: {} }),
    );
    // Missing token field — should delete v1 without migration
    await migrateV1toV2("any-token");
    expect(localStorage.getItem("pi-finance:snapshot:v1")).toBeNull();
  });

  it("never stores the raw token in IndexedDB (only its SHA-256 fingerprint)", async () => {
    await writeV2Snapshot(TEST_TOKEN, TEST_DOMAIN, [{ id: "a1", name: "Nubank" }] as never);

    const rawDb = await openSnapshotDb();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const tx = rawDb.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(V2_ENVELOPE_KEY);
      req.onsuccess = () => { rawDb.close(); resolve(req.result); };
      req.onerror = () => { rawDb.close(); reject(req.error); };
    });
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain(TEST_TOKEN);
    expect((raw as { ownerFingerprint?: string } | null)?.ownerFingerprint).not.toBe(TEST_TOKEN);
  });

  it("uses the documented object store name and envelope key (raw schema)", async () => {
    await writeV2Snapshot(TEST_TOKEN, TEST_DOMAIN, [{ id: "a1" }] as never);

    const db = await openSnapshotDb();
    // Store name and envelope key are hardcoded here so this assertion still
    // holds even if the internal constants are mutated.
    expect(db.objectStoreNames).toContain("snapshots");
    const tx = db.transaction("snapshots", "readonly");
    const probe = await new Promise<unknown>((resolve, reject) => {
      const r = tx.objectStore("snapshots").get("v2");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    expect(probe).not.toBeUndefined();
  });

  it("returns null when v2 domain data is present but syncedAt is missing", async () => {
    await writeV2Snapshot(TEST_TOKEN, "accounts", [{ id: "a1" }] as never);
    // Re-write the envelope dropping syncedAt.accounts to exercise the
    // `syncedAt === undefined` branch in readV2Snapshot.
    const fp = await new Promise<string>((resolve) => {
      const enc = new TextEncoder().encode(TEST_TOKEN);
      crypto.subtle.digest("SHA-256", enc).then((hash) =>
        resolve(
          Array.from(new Uint8Array(hash))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
        ),
      );
    });
    const db = await openSnapshotDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(
        {
          schema: 2,
          ownerFingerprint: fp,
          domains: { accounts: [{ id: "a1" }] },
          syncedAt: {},
        },
        V2_ENVELOPE_KEY,
      );
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
    const result = await readV2Snapshot(TEST_TOKEN, "accounts");
    expect(result).toBeNull();
  });

  it("returns null when v2 syncedAt is present but domain data is missing", async () => {
    const fp = await new Promise<string>((resolve) => {
      const enc = new TextEncoder().encode(TEST_TOKEN);
      crypto.subtle.digest("SHA-256", enc).then((hash) =>
        resolve(
          Array.from(new Uint8Array(hash))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
        ),
      );
    });
    const db = await openSnapshotDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(
        {
          schema: 2,
          ownerFingerprint: fp,
          domains: {},
          syncedAt: { accounts: "2026-07-13T00:00:00.000Z" },
        },
        V2_ENVELOPE_KEY,
      );
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
    const result = await readV2Snapshot(TEST_TOKEN, "accounts");
    expect(result).toBeNull();
  });
});
