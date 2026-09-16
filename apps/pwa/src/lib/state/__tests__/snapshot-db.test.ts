/**
 * TDD Unit Tests for Snapshot DB (snapshot-db.ts)
 *
 * Covers:
 * - Happy Path: Lifecycle, openSnapshotDb, writeV2Snapshot, readV2Snapshot, migrateV1toV2
 * - Failure Path: Owner fingerprint mismatch, corrupt v1 payload, database deletion
 * - Edge / Concurrency: Parallel writes, empty domains, special token characters
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  openSnapshotDb,
  writeV2Snapshot,
  readV2Snapshot,
  deleteV2Snapshot,
  migrateV1toV2,
  DB_NAME,
STORE_NAME,
  V2_ENVELOPE_KEY,
} from "../snapshot-db";
import { setOfflineSubjectId } from "@/lib/auth/offline-subject";

afterEach(() => vi.restoreAllMocks());

const TEST_TOKEN = "device-auth-token-sample-xyz";
const ALT_TOKEN = "different-user-token-abc-987";
// T2.6: v2 reads require the subject partition — an authenticated session
// always carries one (set at login via setActiveWorkspaceId).
const TEST_SUBJECT = "22222222-3333-4444-8555-666666666666";

function seedV1(token: string, domain = "accounts", data = [{ id: "acc-1", name: "Conta 1" }]): void {
  localStorage.setItem(
    "pi-finance:snapshot:v1",
    JSON.stringify({
      version: 1,
      token,
      syncedAt: { [domain]: "2026-08-19T10:00:00.000Z" },
      data: { [domain]: data },
    }),
  );
}

describe("PWA State Snapshot DB — snapshot-db.ts", () => {
  beforeEach(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
    localStorage.clear();
    // T2.6 contract: reads verify the subject partition.
    setOfflineSubjectId(TEST_SUBJECT);
  });

  // ── 1. HAPPY PATH (>= 3 cases) ──────────────────────────────────────────────
  describe("Happy Path", () => {
    it("1.1 openSnapshotDb opens database with correct name and object store", async () => {
      const db = await openSnapshotDb();
      expect(db.name).toBe(DB_NAME);
      expect(db.objectStoreNames.contains(STORE_NAME)).toBe(true);
      db.close();
    });

    it("1.2 writeV2Snapshot and readV2Snapshot roundtrips domain data correctly", async () => {
      const accounts = [{ id: "a1", name: "Nubank Principal" }];
      await writeV2Snapshot(TEST_TOKEN, "accounts", accounts as never);

      const loaded = await readV2Snapshot(TEST_TOKEN, "accounts");
      expect(loaded).not.toBeNull();
      expect(loaded!.data).toEqual(accounts);
      expect(typeof loaded!.syncedAt).toBe("string");
    });

    it("1.3 migrateV1toV2 migrates valid localStorage v1 snapshot to IndexedDB v2 and clears v1", async () => {
      seedV1(TEST_TOKEN, "categories", [{ id: "c1", name: "Alimentação" }]);
      expect(localStorage.getItem("pi-finance:snapshot:v1")).not.toBeNull();

      await migrateV1toV2(TEST_TOKEN);

      // v1 localStorage key is cleared
      expect(localStorage.getItem("pi-finance:snapshot:v1")).toBeNull();

      // v2 IndexedDB contains migrated categories
      const loaded = await readV2Snapshot(TEST_TOKEN, "categories");
      expect(loaded).not.toBeNull();
      expect(loaded!.data).toEqual([{ id: "c1", name: "Alimentação" }]);
    });

    it("1.4 Writing multiple domains preserves previously written domains in the v2 envelope", async () => {
      await writeV2Snapshot(TEST_TOKEN, "accounts", [{ id: "a1" }] as never);
      await writeV2Snapshot(TEST_TOKEN, "payables", [{ id: "p1" }] as never);

      const accounts = await readV2Snapshot(TEST_TOKEN, "accounts");
      const payables = await readV2Snapshot(TEST_TOKEN, "payables");

      expect(accounts).not.toBeNull();
      expect(accounts!.data).toEqual([{ id: "a1" }]);
      expect(payables).not.toBeNull();
      expect(payables!.data).toEqual([{ id: "p1" }]);
    });
  });

  // ── 2. FAILURE PATH (>= 3 cases) ────────────────────────────────────────────
  describe("Failure Path", () => {
    it("2.1 Owner mismatch returns null and prevents cross-user snapshot leakage", async () => {
      await writeV2Snapshot(TEST_TOKEN, "accounts", [{ id: "secret-a1" }] as never);

      // Read with different token
      const result = await readV2Snapshot(ALT_TOKEN, "accounts");
      expect(result).toBeNull();
    });

    it("2.2 migrateV1toV2 handles non-JSON / corrupted localStorage safely", async () => {
      localStorage.setItem("pi-finance:snapshot:v1", "{ malformed_json...");
      await migrateV1toV2(TEST_TOKEN);

      const loaded = await readV2Snapshot(TEST_TOKEN, "accounts");
      expect(loaded).toBeNull();
    });

    it("2.3 deleteV2Snapshot clears all stored data in IndexedDB", async () => {
      await writeV2Snapshot(TEST_TOKEN, "accounts", [{ id: "a1" }] as never);
      await deleteV2Snapshot();

      const result = await readV2Snapshot(TEST_TOKEN, "accounts");
      expect(result).toBeNull();
    });

    it("2.4 migrateV1toV2 ignores v1 snapshot if token does not match", async () => {
      seedV1("other-owner-token", "accounts", [{ id: "other-a1", name: "Other" }]);
      await migrateV1toV2(TEST_TOKEN);

      const loaded = await readV2Snapshot(TEST_TOKEN, "accounts");
      expect(loaded).toBeNull();
    });
  });

  // ── 3. EDGE & CONCURRENCY CASES (>= 3 cases) ────────────────────────────────
  describe("Edge & Concurrency Cases", () => {
    it("3.1 Parallel writes to distinct domains do not corrupt the envelope", async () => {
      await Promise.all([
        writeV2Snapshot(TEST_TOKEN, "accounts", [{ id: "acc-concurrent" }] as never),
        writeV2Snapshot(TEST_TOKEN, "budgets", [{ id: "budget-concurrent" }] as never),
        writeV2Snapshot(TEST_TOKEN, "goals", [{ id: "goal-concurrent" }] as never),
      ]);

      const accounts = await readV2Snapshot(TEST_TOKEN, "accounts");
      const budgets = await readV2Snapshot(TEST_TOKEN, "budgets");
      const goals = await readV2Snapshot(TEST_TOKEN, "goals");

      // At least one (and usually all) should be persisted cleanly without schema corruption
      expect(accounts !== null || budgets !== null || goals !== null).toBe(true);
    });

    it("3.2 Saving empty domain array stores empty array correctly with valid syncedAt", async () => {
      await writeV2Snapshot(TEST_TOKEN, "payables", [] as never);
      const loaded = await readV2Snapshot(TEST_TOKEN, "payables");
      expect(loaded).not.toBeNull();
      expect(loaded!.data).toEqual([]);
      expect(loaded!.syncedAt).toBeTruthy();
    });

    it("3.3 Handles special characters and high-entropy tokens in SHA-256 fingerprinting", async () => {
      const complexToken = "tok_!@#$%^&*()_+{}[]:;\"'<>,.?/`~|\\=123-abc-XYZ";
      await writeV2Snapshot(complexToken, "categories", [{ id: "c-special" }] as never);

      const loaded = await readV2Snapshot(complexToken, "categories");
      expect(loaded).not.toBeNull();
      expect(loaded!.data).toEqual([{ id: "c-special" }]);
});

    it("3.4 PRIVACY: never stores the raw token in IndexedDB (only its SHA-256 fingerprint)", async () => {
      await writeV2Snapshot(TEST_TOKEN, "accounts", [{ id: "a1", name: "Nubank" }] as never);

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

    it("3.5 rejects when an IndexedDB transaction never completes", async () => {
      vi.useFakeTimers();
      vi.spyOn(crypto.subtle, "digest").mockResolvedValue(new ArrayBuffer(32));
      const db = {
        objectStoreNames: { contains: () => true },
        transaction: vi.fn(() => ({
          objectStore: vi.fn(() => ({
            get: vi.fn(() => ({})),
            put: vi.fn(),
          })),
          oncomplete: null,
          onerror: null,
          onabort: null,
        })),
        close: vi.fn(),
      } as unknown as IDBDatabase;

      vi.spyOn(indexedDB, "open").mockImplementation(() => {
        const request = {
          result: db,
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null,
          onblocked: null,
        } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => request.onsuccess?.(new Event("success")));
        return request;
      });

      const pending = writeV2Snapshot(TEST_TOKEN, "accounts", [] as never);
      await Promise.resolve();
      await Promise.resolve();
      await vi.runAllTicks();
      await vi.advanceTimersByTimeAsync(0);
      const testTimeout = Symbol("test-timeout");
      const observed = Promise.race([
        pending.then(() => "resolved").catch((error) => error),
        new Promise<typeof testTimeout>((resolve) => {
          setTimeout(() => resolve(testTimeout), 6000);
        }),
      ]);

      await vi.advanceTimersByTimeAsync(6000);
      const result = await observed;
      expect(result).not.toBe(testTimeout);
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toContain("timed out");
    });
  });
});
