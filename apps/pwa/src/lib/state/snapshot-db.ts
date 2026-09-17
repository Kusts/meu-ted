/**
 * Snapshot DB — IndexedDB v2 offline snapshot.
 *
 * Partitioned by offlineSubjectId (the active workspace/household UUID —
 * opaque, non-credential, never derived from a credential — SPEC §8.B4,
 * D-V4-11). The SHA-256 token fingerprint stays as an ADDITIONAL defense
 * layer, never the primary key. Every envelope carries
 * lastOnlineAuthenticatedAt (SPEC §10 D1); reads fail closed when the age
 * exceeds MAX_OFFLINE_AUTH_AGE (SPEC §10 D2, default 72h, call-time env
 * `NEXT_PUBLIC_MAX_OFFLINE_AUTH_AGE_HOURS`).
 *
 * Migration (T2.6): pre-T2.6 envelopes keyed by fingerprint only (no
 * subject, no age) are treated as untrusted on read — invalidated (deleted)
 * so the next online cycle re-syncs. Zero data loss: the snapshot is a
 * re-syncable cache, never the source of truth (the API is).
 *
 * On corrupt/schema/owner mismatch: delete v2 and return no data,
 * forcing online sync.
 */
import { getOfflineSubjectId } from "@/lib/auth/offline-subject";
import { getMaxOfflineAuthAgeMs, isOfflineSnapshotEnabled } from "@/lib/capabilities";
// Local types — duplicated structurally from snapshot-store, but using the real
// domain shapes from ./types (a leaf module, so no circular dependency).
// Keeping the shapes identical to snapshot-store's SnapshotDomains lets
// readV2Snapshot's return type satisfy loadSnapshotDomain's signature.
import type {
  Account, Category, Transaction, Payable, Budget, Goal, Subscription, CardStatement,
} from "./types";

export type DomainKey =
  | "accounts"
  | "categories"
  | "transactions"
  | "payables"
  | "budgets"
  | "goals"
  | "subscriptions"
  | "cardStatements";

export interface SnapshotDomains {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  payables: Payable[];
  budgets: Budget[];
  goals: Goal[];
  subscriptions: Subscription[];
  cardStatements: CardStatement[];
}

export const DB_NAME = "pi-finance-snapshot";
export const STORE_NAME = "snapshots";
export const V2_ENVELOPE_KEY = "v2";
export const SNAPSHOT_OPERATION_TIMEOUT_MS = 5_000;

// ── Types ──────────────────────────────────────────────────────────

interface V2Envelope {
  schema: 2;
  ownerFingerprint: string;
  /**
   * Partition key (T2.6 B4): active workspace/household UUID. Absent only
   * on legacy (pre-T2.6) envelopes, which are treated as untrusted.
   */
  offlineSubjectId?: string;
  /**
   * Last online-authenticated instant (T2.6 D1, ISO). Refreshed on every
   * online write/migration/revalidation. Absent only on legacy envelopes.
   */
  lastOnlineAuthenticatedAt?: string;
  domains: Partial<SnapshotDomains>;
  syncedAt: Partial<Record<DomainKey, string>>;
}

// ── Offline age policy (T2.6 D1-D3, ADR-015) ─────────────────────────

/**
 * Closed age-band enum for the `offline.locked` telemetry event (T0.4.4,
 * SPEC §24.4): coarse bands only — never timestamps, durations or free
 * text. Mirrors the API-side OFFLINE_AGE_BANDS allowlist.
 */
export const OFFLINE_AGE_BANDS = ["<1d", "1-7d", "7-30d", ">30d"] as const;

export type OfflineAgeBand = (typeof OFFLINE_AGE_BANDS)[number];

/**
 * Clock-skew allowance (ADR-015: tolerance registered, never authority):
 * max(5 minutes, 5% of the max age). A device clock slightly behind the
 * stamping clock must not false-lock; the allowance only EXTENDS the
 * limit, never bypasses the check.
 */
export function getOfflineClockSkewMs(maxAgeMs: number): number {
  return Math.max(5 * 60_000, maxAgeMs * 0.05);
}

export function getOfflineAgeBand(ageMs: number): OfflineAgeBand {
  const day = 24 * 3_600_000;
  if (ageMs < day) return "<1d";
  if (ageMs < 7 * day) return "1-7d";
  if (ageMs < 30 * day) return "7-30d";
  return ">30d";
}

export type OfflineLockState =
  | { state: "empty" }
  | { state: "ok"; offlineSubjectId: string; ageMs: number; ageBand: OfflineAgeBand }
  | {
      state: "locked";
      reason: "no-subject" | "expired";
      offlineSubjectId?: string;
      ageMs?: number;
      ageBand?: OfflineAgeBand;
    }
  | { state: "untrusted"; reason: "legacy-envelope" | "subject-mismatch" | "missing-age" };

/**
 * Pure lock evaluation (unit-tested; the offline shell mirrors this logic
 * in plain JS — see public/offline-shell.js — with the same 72h default
 * and skew rule, since the shell runs without the app bundle).
 */
export function evaluateOfflineLock(
  env: { offlineSubjectId?: unknown; lastOnlineAuthenticatedAt?: unknown } | null,
  subject: string | null,
  nowMs: number,
  maxAgeMs: number,
): OfflineLockState {
  if (!env) return { state: "empty" };
  // No local subject: ownership cannot be verified → fail closed. The
  // envelope is kept (it may belong to a subject restored on next login).
  if (!subject) return { state: "locked", reason: "no-subject" };
  if (typeof env.offlineSubjectId !== "string" || env.offlineSubjectId.length === 0) {
    return { state: "untrusted", reason: "legacy-envelope" };
  }
  if (env.offlineSubjectId !== subject) {
    return { state: "untrusted", reason: "subject-mismatch" };
  }
  if (typeof env.lastOnlineAuthenticatedAt !== "string") {
    return { state: "untrusted", reason: "missing-age" };
  }
  const stamped = Date.parse(env.lastOnlineAuthenticatedAt);
  if (Number.isNaN(stamped)) return { state: "untrusted", reason: "missing-age" };
  // Future stamps (clock moved backwards) clamp to zero — never negative.
  const ageMs = Math.max(0, nowMs - stamped);
  if (ageMs > maxAgeMs + getOfflineClockSkewMs(maxAgeMs)) {
    return {
      state: "locked",
      reason: "expired",
      offlineSubjectId: subject,
      ageMs,
      ageBand: getOfflineAgeBand(ageMs),
    };
  }
  return { state: "ok", offlineSubjectId: subject, ageMs, ageBand: getOfflineAgeBand(ageMs) };
}

/**
 * Read the envelope and evaluate the offline lock with live clock and
 * call-time max age. Never throws: storage failures report "empty"
 * (fail-closed at the reader, which treats non-ok as no data).
 */
export async function getOfflineSnapshotLockState(
  nowMs: number = Date.now(),
  maxAgeMs: number = getMaxOfflineAuthAgeMs(),
): Promise<OfflineLockState> {
  // D10 optional disable: no snapshot may be trusted while disabled.
  if (!isOfflineSnapshotEnabled()) return { state: "empty" };
  try {
    const env = await readV2Envelope();
    return evaluateOfflineLock(env, getOfflineSubjectId(), nowMs, maxAgeMs);
  } catch {
    return { state: "empty" };
  }
}

/**
 * Online revalidation (T2.6 D3): refresh the envelope's age stamp to now
 * after a successful online authentication, preserving domains. Returns
 * false when there is nothing to refresh. Never creates an envelope —
 * creation happens only through authenticated writes/migration.
 */
export async function refreshOfflineAuthAge(nowIso?: string): Promise<boolean> {
  // D10 optional disable: nothing to refresh while disabled.
  if (!isOfflineSnapshotEnabled()) return false;
  const at = nowIso ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(at))) return false;
  let refreshed = false;
  await withWriteLock(async () => {
    const existing = await readV2Envelope();
    if (!existing) return;
    existing.lastOnlineAuthenticatedAt = at;
    await writeV2Envelope(existing);
    refreshed = true;
  });
  return refreshed;
}

// ── Database lifecycle ─────────────────────────────────────────────

/** Open (or create) the IndexedDB snapshot database with safety timeout. */
export function openSnapshotDb(timeoutMs = 5000): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported"));
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error("IndexedDB open timed out"));
    }, timeoutMs);

    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        clearTimeout(timer);
        resolve(request.result);
      };
      request.onerror = () => {
        clearTimeout(timer);
        reject(request.error);
      };
      request.onblocked = () => {
        clearTimeout(timer);
        reject(new Error("IndexedDB database blocked"));
      };
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
}

// ── Token fingerprint ──────────────────────────────────────────────

async function fingerprint(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Read / Write / Delete ─────────────────────────────────────────

async function readV2Envelope(): Promise<V2Envelope | null> {
  const db = await openSnapshotDb();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      db.close();
      reject(new Error("IndexedDB transaction timed out"));
    }, SNAPSHOT_OPERATION_TIMEOUT_MS);
    const finish = (value: V2Envelope | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(V2_ENVELOPE_KEY);
    req.onsuccess = () => {
      const envelope = req.result as V2Envelope | undefined;
      finish(envelope ?? null);
    };
    req.onerror = () => finish(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => fail(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => fail(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function writeV2Envelope(env: V2Envelope): Promise<void> {
  const db = await openSnapshotDb();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      db.close();
      reject(new Error("IndexedDB transaction timed out"));
    }, SNAPSHOT_OPERATION_TIMEOUT_MS);
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    try {
      store.put(env, V2_ENVELOPE_KEY);
      tx.oncomplete = () => { db.close(); finish(); };
      tx.onerror = () => { db.close(); finish(tx.error); };
      tx.onabort = () => { db.close(); finish(tx.error); };
    } catch (error) {
      db.close();
      finish(error);
    }
  });
}

/** Delete the entire v2 snapshot. Idempotent. */
export async function deleteV2Snapshot(): Promise<void> {
  const db = await openSnapshotDb();
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      db.close();
      resolve();
    }, SNAPSHOT_OPERATION_TIMEOUT_MS);
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    try {
      store.delete(V2_ENVELOPE_KEY);
      tx.oncomplete = () => { db.close(); finish(); };
      tx.onerror = () => { db.close(); finish(); }; // swallow
      tx.onabort = () => { db.close(); finish(); }; // swallow
    } catch {
      db.close();
      finish();
    }
  });
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Read one domain from v2 snapshot.
 *
 * Fail-closed (T2.6): returns null on owner mismatch, corrupt data,
 * missing envelope, subject partition miss, missing age stamp, or expired
 * age (`offline session locked`). Untrusted envelopes (legacy without
 * subject/age, subject mismatch) are invalidated so the next online cycle
 * re-syncs; merely expired envelopes are KEPT so online revalidation can
 * unlock without a full re-sync.
 */
export async function readV2Snapshot<K extends DomainKey>(
  token: string,
  domain: K,
): Promise<{ data: SnapshotDomains[K]; syncedAt: string } | null> {
  // D10 optional disable: serve nothing while disabled.
  if (!isOfflineSnapshotEnabled()) return null;
  try {
    const fp = await fingerprint(token);
    const env = await readV2Envelope();

    if (!env || env.schema !== 2 || env.ownerFingerprint !== fp) {
      // Owner mismatch or corrupt — delete v2, return null
      if (env) await deleteV2Snapshot();
      return null;
    }

    const lock = evaluateOfflineLock(
      env,
      getOfflineSubjectId(),
      Date.now(),
      getMaxOfflineAuthAgeMs(),
    );
    if (lock.state === "locked") return null; // kept for revalidation
    if (lock.state !== "ok") {
      // Untrusted (legacy / mismatch / missing age) — invalidate, re-sync online.
      await deleteV2Snapshot();
      return null;
    }

    const data = env.domains[domain];
    const syncedAt = env.syncedAt[domain];
    if (data === undefined || syncedAt === undefined) return null;

    return { data: data as SnapshotDomains[K], syncedAt };
  } catch {
    await deleteV2Snapshot().catch(() => {});
    return null;
  }
}

export interface WriteV2SnapshotOptions {
  /**
   * Override the age stamp (tests / controlled re-stamps). Defaults to
   * now. Invalid values fall back to now — a write is always an
   * online-authenticated moment, so the stamp must exist.
   */
  lastOnlineAuthenticatedAt?: string;
}

/** Build a fresh envelope base stamped with subject + age. */
function freshEnvelope(fp: string, authenticatedAt: string): V2Envelope {
  const subject = getOfflineSubjectId();
  return {
    schema: 2,
    ownerFingerprint: fp,
    ...(subject ? { offlineSubjectId: subject } : {}),
    lastOnlineAuthenticatedAt: authenticatedAt,
    domains: {},
    syncedAt: {},
  };
}

function resolveAuthenticatedAt(override?: string): string {
  if (override && !Number.isNaN(Date.parse(override))) return override;
  return new Date().toISOString();
}

/**
 * Write one domain to the v2 snapshot.
 * Stamps with the token fingerprint (never the raw token) plus the
 * offlineSubjectId partition and the last-online-auth age stamp.
 */
export async function writeV2Snapshot<K extends DomainKey>(
  token: string,
  domain: K,
  data: SnapshotDomains[K],
  opts?: WriteV2SnapshotOptions,
): Promise<void> {
  // D10 optional disable: persist nothing while disabled.
  if (!isOfflineSnapshotEnabled()) return;
  const fp = await fingerprint(token);
  const authenticatedAt = resolveAuthenticatedAt(opts?.lastOnlineAuthenticatedAt);
  const subject = getOfflineSubjectId();
  // Serialize the read-modify-write so concurrent bootstrap writes (one per
  // domain) cannot read a stale envelope and overwrite each other's data.
  await withWriteLock(async () => {
    const existing = await readV2Envelope();
    // Adopt only the same partition (fingerprint + subject). A subjectless
    // writer never adopts a subject-stamped envelope (it may belong to a
    // session whose subject was lost) — it starts a fresh base instead.
    const samePartition =
      existing &&
      existing.ownerFingerprint === fp &&
      (subject === null ? !existing.offlineSubjectId : existing.offlineSubjectId === subject);
    const base: V2Envelope = samePartition
      ? existing
      : freshEnvelope(fp, authenticatedAt);

    // A new partition base already carries the stamp; an adopted envelope
    // is refreshed because this write is an online-authenticated moment.
    // Legacy adopted envelopes (no subject field) gain the current subject
    // only when one is present — never a credential-derived value.
    if (subject && !base.offlineSubjectId) base.offlineSubjectId = subject;
    base.lastOnlineAuthenticatedAt = authenticatedAt;
    base.domains[domain] = data;
    base.syncedAt[domain] = new Date().toISOString();

    await writeV2Envelope(base);
  });
}

// ── Write serialization ───────────────────────────────────────────
// writeV2Snapshot is read-modify-write; bootstrap fires one write per domain
// concurrently. A single-chain lock guarantees each write observes the prior
// one's commit, eliminating lost-update races.
let writeChain: Promise<unknown> = Promise.resolve();

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  // Keep the chain alive regardless of success/failure, but swallow rejections
  // so a single failed write does not poison later writes.
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Migrate data from localStorage v1 to IndexedDB v2.
 * Validates, writes to v2, then deletes v1.
 * On v1 corruption or owner mismatch: silently clean up.
 */
export async function migrateV1toV2(token: string): Promise<void> {
  const V1_KEY = "pi-finance:snapshot:v1";

  // ── Step 1: parse v1 (migration input only) ──
  let v1: { token: string; syncedAt: Record<string, string>; data: Record<string, unknown> } | null = null;
  try {
    const raw = localStorage.getItem(V1_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && parsed.token) {
        v1 = parsed;
      } else {
        // Valid JSON but not a usable v1 envelope (wrong version / missing token):
        // not a migration source — discard to avoid stale garbage.
        localStorage.removeItem(V1_KEY);
        return;
      }
    }
  } catch {
    // Corrupt / unparseable v1 — unrecoverable. Discard safely.
    try { localStorage.removeItem(V1_KEY); } catch { /* noop */ }
    return;
  }

  if (!v1) return; // nothing to migrate

  // ── Step 2: owner check ──
  // v1 belongs to a different token/session — preserve it so the rightful
  // session can migrate it later. Never mix owners or delete another user's cache.
  if (v1.token !== token) return;

  // ── Step 3: migrate under the active session, validate, then delete ──
  // All IndexedDB access is isolated: any failure PRESERVES v1 (never deletes),
  // so an interrupted migration cannot lose the only copy of the data.
  try {
    const fp = await fingerprint(token);
    const existing = await readV2Envelope();
    const subject = getOfflineSubjectId();
    const authenticatedAt = new Date().toISOString();
    const samePartition =
      existing &&
      existing.ownerFingerprint === fp &&
      (subject === null ? !existing.offlineSubjectId : existing.offlineSubjectId === subject);
    const base: V2Envelope = samePartition
      ? existing
      : freshEnvelope(fp, authenticatedAt);

    for (const domain of Object.keys(v1.data)) {
      base.domains[domain as keyof SnapshotDomains] = v1.data[domain] as never;
    }
    for (const domain of Object.keys(v1.data)) {
      // Fall back to now when the v1 envelope lacks a per-domain syncedAt so
      // the v2 read path (which requires syncedAt) never discards valid data.
      base.syncedAt[domain as DomainKey] =
        v1.syncedAt[domain] ?? new Date().toISOString();
    }
    // Migration runs inside an authenticated bootstrap: the adopted or fresh
    // base carries the current subject partition and a fresh age stamp.
    if (subject && !base.offlineSubjectId) base.offlineSubjectId = subject;
    base.lastOnlineAuthenticatedAt = authenticatedAt;

    await writeV2Envelope(base);

    // Validation: reread v2 and confirm our data actually landed before we
    // are allowed to delete the v1 source.
    const reread = await readV2Envelope();
    const migrated =
      reread !== null &&
      reread.schema === 2 &&
      reread.ownerFingerprint === fp &&
      Object.keys(v1.data).every((d) => d in reread.domains);

    if (!migrated) {
      // Write didn't stick — discard any partial v2 for this owner, keep v1.
      await deleteV2Snapshot().catch(() => {});
      return;
    }

    // Success: only now delete the v1 source.
    localStorage.removeItem(V1_KEY);
  } catch {
    // Migration failed (storage/IndexedDB error). Preserve v1; discard partial v2.
    await deleteV2Snapshot().catch(() => {});
  }
}
