import type {
  Account,
  Category,
  Transaction,
  Payable,
  Budget,
  Goal,
  Subscription,
  CardStatement,
} from "./types";

const SNAPSHOT_KEY = "pi-finance:snapshot:v1";

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

interface SnapshotEnvelope {
  version: 1;
  token: string;
  syncedAt: Partial<Record<DomainKey, string>>;
  data: Partial<SnapshotDomains>;
}

function read(): SnapshotEnvelope | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SnapshotEnvelope;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function write(env: SnapshotEnvelope): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(env));
  } catch {
    /* noop — quota or storage unavailable */
  }
}

/** Persist one domain, stamped with token + ISO syncedAt. A token change discards the prior envelope. */
export function saveDomain<K extends DomainKey>(
  token: string,
  domain: K,
  data: SnapshotDomains[K],
): void {
  const existing = read();
  const base: SnapshotEnvelope =
    existing && existing.token === token
      ? existing
      : { version: 1, token, syncedAt: {}, data: {} };
  write({
    ...base,
    data: { ...base.data, [domain]: data },
    syncedAt: { ...base.syncedAt, [domain]: new Date().toISOString() },
  });
}

/** Read one domain if it belongs to the current token; null otherwise. */
export function loadDomain<K extends DomainKey>(
  token: string,
  domain: K,
): { data: SnapshotDomains[K]; syncedAt: string } | null {
  const env = read();
  if (!env || env.token !== token) return null;
  const data = env.data[domain];
  const syncedAt = env.syncedAt[domain];
  if (data === undefined || syncedAt === undefined) return null;
  return { data: data as SnapshotDomains[K], syncedAt };
}

/** Clear the entire snapshot (on 401 / device switch). */
export function clearSnapshot(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* noop */
  }
}
