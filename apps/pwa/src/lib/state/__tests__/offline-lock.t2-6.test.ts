/**
 * T2.6 RED — Offline snapshot partition + maxOfflineAge (SPEC §10 D1-D3,
 * §8.B4/D-V4-11, INV-06; achado REV-V4-2).
 *
 * Baseline: readV2Snapshot checks only ownerFingerprint, never age or
 * offlineSubjectId. Every test below FAILS on that baseline and passes
 * once the envelope carries { offlineSubjectId, lastOnlineAuthenticatedAt }
 * with fail-closed age checks.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  writeV2Snapshot,
  readV2Snapshot,
  deleteV2Snapshot,
  getOfflineSnapshotLockState,
  getOfflineClockSkewMs,
  getOfflineAgeBand,
  openSnapshotDb,
  STORE_NAME,
  V2_ENVELOPE_KEY,
} from "../snapshot-db";
import { getMaxOfflineAuthAgeMs } from "@/lib/capabilities";
import {
  getOfflineSubjectId,
  setOfflineSubjectId,
  clearOfflineSubjectId,
  OFFLINE_SUBJECT_STORAGE_KEY,
} from "@/lib/auth/offline-subject";
import { createCommands, OfflineWriteError } from "../commands";

const TOKEN = "t2-6-offline-lock-token";
const SUBJECT_A = "11111111-2222-4333-8444-555555555555";
const SUBJECT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

async function fingerprintHex(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Plant a legacy v2 envelope (pre-T2.6: fingerprint-keyed, no subject, no age). */
async function plantLegacyEnvelope(token: string): Promise<void> {
  const fp = await fingerprintHex(token);
  const db = await openSnapshotDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(
      {
        schema: 2,
        ownerFingerprint: fp,
        domains: { accounts: [{ id: "legacy-a1" }] },
        syncedAt: { accounts: hoursAgo(1) },
      },
      V2_ENVELOPE_KEY,
    );
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

async function readRawEnvelope(): Promise<unknown> {
  const db = await openSnapshotDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(V2_ENVELOPE_KEY);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

describe("T2.6 offline lock (RED on baseline)", () => {
  beforeEach(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
    localStorage.clear();
    vi.unstubAllEnvs();
    expect(setOfflineSubjectId(SUBJECT_A)).toBe(true);
    expect(getOfflineSubjectId()).toBe(SUBJECT_A);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("within the age limit the snapshot is served (state ok)", async () => {
    await writeV2Snapshot(TOKEN, "accounts", [{ id: "a1" }] as never);
    const loaded = await readV2Snapshot(TOKEN, "accounts");
    expect(loaded).not.toBeNull();
    expect(loaded!.data).toEqual([{ id: "a1" }]);
    const state = await getOfflineSnapshotLockState();
    expect(state.state).toBe("ok");
  });

  it("expired age → fail-closed null + locked state with age band", async () => {
    await writeV2Snapshot(TOKEN, "accounts", [{ id: "a1" }] as never, {
      lastOnlineAuthenticatedAt: hoursAgo(80), // > 72h default + skew
    });
    const loaded = await readV2Snapshot(TOKEN, "accounts");
    expect(loaded).toBeNull();
    const state = await getOfflineSnapshotLockState();
    expect(state.state).toBe("locked");
    expect(state).toMatchObject({ ageBand: "1-7d", offlineSubjectId: SUBJECT_A });
  });

  it("age inside the clock-skew allowance still serves (72h + 1h ok, 72h + 4h locked)", async () => {
    await writeV2Snapshot(TOKEN, "accounts", [{ id: "a1" }] as never, {
      lastOnlineAuthenticatedAt: hoursAgo(73),
    });
    expect(await readV2Snapshot(TOKEN, "accounts")).not.toBeNull();

    await writeV2Snapshot(TOKEN, "accounts", [{ id: "a1" }] as never, {
      lastOnlineAuthenticatedAt: hoursAgo(80),
    });
    expect(await readV2Snapshot(TOKEN, "accounts")).toBeNull();
  });

  it("legacy envelope without stamped age → untrusted: invalidated, re-sync allowed", async () => {
    await plantLegacyEnvelope(TOKEN);
    const pre = await getOfflineSnapshotLockState();
    expect(pre.state).toBe("untrusted");
    expect(await readV2Snapshot(TOKEN, "accounts")).toBeNull();
    // Migration: cache invalidated (zero loss — re-syncable), never served.
    expect(await readRawEnvelope()).toBeNull();
  });

  it("subject mismatch → null (partition by offlineSubjectId, never by credential)", async () => {
    await writeV2Snapshot(TOKEN, "accounts", [{ id: "a1" }] as never);
    expect(setOfflineSubjectId(SUBJECT_B)).toBe(true);
    expect(await readV2Snapshot(TOKEN, "accounts")).toBeNull();
  });

  it("no subject in localStorage → locked, never renders (shell without subject locks)", async () => {
    await writeV2Snapshot(TOKEN, "accounts", [{ id: "a1" }] as never);
    clearOfflineSubjectId();
    expect(localStorage.getItem(OFFLINE_SUBJECT_STORAGE_KEY)).toBeNull();
    expect(await readV2Snapshot(TOKEN, "accounts")).toBeNull();
    const state = await getOfflineSnapshotLockState();
    expect(state.state).toBe("locked");
    expect(state).toMatchObject({ reason: "no-subject" });
  });

  it("opens by subject with NO bearer credential in localStorage (T2.3 B4 proof)", async () => {
    expect(localStorage.getItem("pi-finance:session-token")).toBeNull();
    expect(localStorage.getItem("pi-finance:token")).toBeNull();
    await writeV2Snapshot(TOKEN, "accounts", [{ id: "a1" }] as never);
    const loaded = await readV2Snapshot(TOKEN, "accounts");
    expect(loaded).not.toBeNull();
    expect(loaded!.data).toEqual([{ id: "a1" }]);
  });

  it("ownerFingerprint stays as an additional layer (wrong token, right subject → null)", async () => {
    await writeV2Snapshot(TOKEN, "accounts", [{ id: "a1" }] as never);
    expect(await readV2Snapshot("some-other-token", "accounts")).toBeNull();
  });

  it("clock-skew allowance is max(5min, 5% of maxAge)", () => {
    expect(getOfflineClockSkewMs(72 * 3_600_000)).toBe(3_600_000 * 3.6);
    expect(getOfflineClockSkewMs(60_000)).toBe(5 * 60_000); // floor wins
  });

  it("age bands are the closed T0.4.4 enum", () => {
    expect(getOfflineAgeBand(0)).toBe("<1d");
    expect(getOfflineAgeBand(23 * 3_600_000)).toBe("<1d");
    expect(getOfflineAgeBand(25 * 3_600_000)).toBe("1-7d");
    expect(getOfflineAgeBand(8 * 24 * 3_600_000)).toBe("7-30d");
    expect(getOfflineAgeBand(31 * 24 * 3_600_000)).toBe(">30d");
  });

  it("max age default is 72h, call-time env override, defensive parse", () => {
    expect(getMaxOfflineAuthAgeMs()).toBe(72 * 3_600_000);
    vi.stubEnv("NEXT_PUBLIC_MAX_OFFLINE_AUTH_AGE_HOURS", "48");
    expect(getMaxOfflineAuthAgeMs()).toBe(48 * 3_600_000);
    vi.stubEnv("NEXT_PUBLIC_MAX_OFFLINE_AUTH_AGE_HOURS", "garbage");
    expect(getMaxOfflineAuthAgeMs()).toBe(72 * 3_600_000);
    vi.stubEnv("NEXT_PUBLIC_MAX_OFFLINE_AUTH_AGE_HOURS", "-5");
    expect(getMaxOfflineAuthAgeMs()).toBe(72 * 3_600_000);
  });

  it("offline writes stay blocked with OfflineWriteError (policy unchanged)", async () => {
    const commands = createCommands({
      online: false,
      token: undefined,
      dispatch: () => {},
      api: {} as never,
    });
    await expect(
      commands.createExpenseTransaction({
        description: "x",
        amountCents: 100,
        date: "2026-09-16",
        categoryId: "c1",
        accountId: "a1",
      }),
    ).rejects.toBeInstanceOf(OfflineWriteError);
  });

  it("expired snapshot is KEPT (not deleted) so online revalidation can unlock", async () => {
    await writeV2Snapshot(TOKEN, "accounts", [{ id: "a1" }] as never, {
      lastOnlineAuthenticatedAt: hoursAgo(80),
    });
    expect(await readV2Snapshot(TOKEN, "accounts")).toBeNull();
    expect(await readRawEnvelope()).not.toBeNull();
    await deleteV2Snapshot();
  });
});
