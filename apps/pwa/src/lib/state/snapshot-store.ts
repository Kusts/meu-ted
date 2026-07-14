/**
 * Snapshot store — v2 canonical offline snapshot.
 *
 * v2 (IndexedDB) is the single source of truth for offline reads/writes:
 * - SHA-256 token fingerprint (the raw token is NEVER stored in IndexedDB)
 * - Schema version 2
 *
 * v1 (localStorage) is ONLY a migration input consumed inside snapshot-db
 * during `migrateV1toV2` before bootstrap; it is deleted after a successful
 * v2 write+reread. No production code reads or writes v1 at runtime — the
 * legacy `saveDomain`/`loadDomain` helpers were removed so there is no
 * runtime v1 fallback path.
 */
import type {
  Account, Category, Transaction, Payable,
  Budget, Goal, Subscription, CardStatement,
} from "./types";
import {
  writeV2Snapshot, readV2Snapshot, migrateV1toV2 as migrateV1toV2Impl,
} from "./snapshot-db";

export type DomainKey =
  | "accounts" | "categories" | "transactions" | "payables"
  | "budgets" | "goals" | "subscriptions" | "cardStatements";

export interface SnapshotDomains {
  accounts: Account[]; categories: Category[]; transactions: Transaction[];
  payables: Payable[]; budgets: Budget[]; goals: Goal[];
  subscriptions: Subscription[]; cardStatements: CardStatement[];
}

// ── v2 canonical API ───────────────────────────────────────────────

/** Save one domain to the v2 (IndexedDB) snapshot. Only a SHA-256 fingerprint of the token is stored. */
export async function saveSnapshotDomain<K extends DomainKey>(
  token: string, domain: K, data: SnapshotDomains[K],
): Promise<void> {
  await writeV2Snapshot(token, domain, data);
}

/** Read one domain from the v2 snapshot. Returns null on owner mismatch, corrupt, or missing. */
export async function loadSnapshotDomain<K extends DomainKey>(
  token: string, domain: K,
): Promise<{ data: SnapshotDomains[K]; syncedAt: string } | null> {
  return readV2Snapshot(token, domain);
}

/** Migrate v1 localStorage → v2 IndexedDB before bootstrap. Idempotent; v1 deleted only after v2 write+reread. */
export async function migrateV1toV2(token: string): Promise<void> {
  await migrateV1toV2Impl(token);
}
