/**
 * Snapshot DB — IndexedDB v2 offline snapshot.
 *
 * Stores domain data keyed by SHA-256 token fingerprint (no plaintext token).
 * Schema version 2. Supports migration from localStorage v1 to IndexedDB v2.
 *
 * On corrupt/schema/owner mismatch: delete v2 and return no data,
 * forcing online sync.
 */
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
  domains: Partial<SnapshotDomains>;
  syncedAt: Partial<Record<DomainKey, string>>;
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
 * Returns null on owner mismatch, corrupt data, or missing envelope.
 */
export async function readV2Snapshot<K extends DomainKey>(
  token: string,
  domain: K,
): Promise<{ data: SnapshotDomains[K]; syncedAt: string } | null> {
  try {
    const fp = await fingerprint(token);
    const env = await readV2Envelope();

    if (!env || env.schema !== 2 || env.ownerFingerprint !== fp) {
      // Owner mismatch or corrupt — delete v2, return null
      if (env) await deleteV2Snapshot();
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

/**
 * Write one domain to the v2 snapshot.
 * Stamps with the token fingerprint (never the raw token).
 */
export async function writeV2Snapshot<K extends DomainKey>(
  token: string,
  domain: K,
  data: SnapshotDomains[K],
): Promise<void> {
  const fp = await fingerprint(token);
  // Serialize the read-modify-write so concurrent bootstrap writes (one per
  // domain) cannot read a stale envelope and overwrite each other's data.
  await withWriteLock(async () => {
    const existing = await readV2Envelope();
    const base: V2Envelope = existing && existing.ownerFingerprint === fp
      ? existing
      : { schema: 2, ownerFingerprint: fp, domains: {}, syncedAt: {} };

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
    const base: V2Envelope = existing && existing.ownerFingerprint === fp
      ? existing
      : { schema: 2, ownerFingerprint: fp, domains: {}, syncedAt: {} };

    for (const domain of Object.keys(v1.data)) {
      base.domains[domain as keyof SnapshotDomains] = v1.data[domain] as never;
    }
    for (const domain of Object.keys(v1.data)) {
      // Fall back to now when the v1 envelope lacks a per-domain syncedAt so
      // the v2 read path (which requires syncedAt) never discards valid data.
      base.syncedAt[domain as DomainKey] =
        v1.syncedAt[domain] ?? new Date().toISOString();
    }

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
