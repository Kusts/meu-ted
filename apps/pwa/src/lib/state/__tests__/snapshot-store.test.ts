/**
 * Snapshot store (wrapper) tests — v2 canonical API surface.
 *
 * These exercise the production-facing wrapper in `snapshot-store.ts`
 * (`saveSnapshotDomain`, `loadSnapshotDomain`, `migrateV1toV2`), which are the
 * only functions production code calls. The lower-level IndexedDB behaviour
 * lives in `snapshot-db.ts` and is covered by `snapshot-db.test.ts`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  saveSnapshotDomain,
  loadSnapshotDomain,
  migrateV1toV2,
} from "../snapshot-store";
import type { SnapshotDomains } from "../snapshot-store";
import { setOfflineSubjectId } from "@/lib/auth/offline-subject";

const TEST_TOKEN = "wrapper-token-xyz";
const V1_KEY = "pi-finance:snapshot:v1";
// T2.6: v2 reads require the subject partition.
const TEST_SUBJECT = "33333333-4444-4555-8666-777777777777";

function seedV1(token: string, data: Partial<SnapshotDomains>): void {
  localStorage.setItem(
    V1_KEY,
    JSON.stringify({ version: 1, token, syncedAt: {}, data }),
  );
}

describe("snapshot-store wrapper — v2 canonical API", () => {
  beforeEach(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) if (db.name) indexedDB.deleteDatabase(db.name);
    localStorage.clear();
    // T2.6 contract: reads verify the subject partition.
    setOfflineSubjectId(TEST_SUBJECT);
  });

  it("round-trips a domain through save/load snapshot (v2)", async () => {
    await saveSnapshotDomain(TEST_TOKEN, "accounts", [
      { id: "a1", name: "Nubank" },
    ] as SnapshotDomains["accounts"]);

    const got = await loadSnapshotDomain(TEST_TOKEN, "accounts");
    expect(got).not.toBeNull();
    expect(got!.data).toHaveLength(1);
    expect((got!.data as unknown[])[0]).toMatchObject({ id: "a1", name: "Nubank" });
    expect(typeof got!.syncedAt).toBe("string");
  });

  it("returns null for a domain written by a different token (owner mismatch)", async () => {
    await saveSnapshotDomain("token-A", "accounts", [
      { id: "a1" },
    ] as SnapshotDomains["accounts"]);

    const got = await loadSnapshotDomain("token-B", "accounts");
    expect(got).toBeNull();
  });

  it("migrateV1toV2 removes the v1 source after a successful migration", async () => {
    seedV1(TEST_TOKEN, { accounts: [{ id: "a1", name: "Seed", kind: "bank" as const, balanceCents: 0 }] });

    await migrateV1toV2(TEST_TOKEN);

    expect(localStorage.getItem(V1_KEY)).toBeNull();
    const v2 = await loadSnapshotDomain(TEST_TOKEN, "accounts");
    expect(v2).not.toBeNull();
    expect((v2!.data as unknown[])[0]).toMatchObject({ id: "a1" });
  });

  it("migrateV1toV2 preserves v1 when it belongs to another token", async () => {
    seedV1("other-token", { accounts: [{ id: "a1", name: "Seed", kind: "bank" as const, balanceCents: 0 }] });

    await migrateV1toV2(TEST_TOKEN);

    // v1 untouched, nothing written for TEST_TOKEN
    expect(localStorage.getItem(V1_KEY)).not.toBeNull();
    const v2 = await loadSnapshotDomain(TEST_TOKEN, "accounts");
    expect(v2).toBeNull();
  });
});
