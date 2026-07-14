/**
 * Pure state reducer for app bootstrap and domain management.
 *
 * Actions are discriminated by type; reducer returns new state snapshot
 * without side effects (no IO, no localStorage, no API calls).
 *
 * The reducer manages:
 * - Domain data + sync source per domain
 * - Loading/error/writeError UI state
 * - readOnly derivation from essential domain sources
 */
// Type imports needed only for type narrowing in switch cases — but unused at import level.
// The data is stored as `unknown` in DomainEntry and typed at consumption.

// ── Domain keys ────────────────────────────────────────────────────

export type DomainKey =
  | "accounts"
  | "categories"
  | "transactions"
  | "payables"
  | "budgets"
  | "goals"
  | "subscriptions"
  | "cardStatements";

export const ALL_DOMAIN_KEYS: DomainKey[] = [
  "accounts", "categories", "transactions", "payables",
  "budgets", "goals", "subscriptions", "cardStatements",
];

export const ESSENTIAL_DOMAIN_KEYS: DomainKey[] = [
  "accounts", "categories", "transactions", "payables",
  "budgets", "goals",
];

export type DataSource = "live" | "snapshot" | "unavailable" | "mock";
const STALE_SOURCES: DataSource[] = ["snapshot", "unavailable"];

// ── State shape ────────────────────────────────────────────────────

export interface DomainEntry {
  data: unknown;
  source: DataSource;
  syncedAt: string | null;
}

export interface AppStateSnapshot {
  domains: Record<DomainKey, DomainEntry>;
  loading: boolean;
  error: string | null;
  writeError: string | null;
  /** Derived: true when ANY essential domain is snapshot or unavailable. */
  readOnly: boolean;
}

// ── Actions ────────────────────────────────────────────────────────

export type AppStateAction =
  | { type: "BOOTSTRAP_START" }
  | { type: "BOOTSTRAP_COMPLETE" }
  | { type: "BOOTSTRAP_401" }
  | { type: "DOMAIN_LIVE"; domain: DomainKey; data: unknown; syncedAt: string }
  | { type: "DOMAIN_SNAPSHOT"; domain: DomainKey; data: unknown; syncedAt: string }
  | { type: "DOMAIN_UNAVAILABLE"; domain: DomainKey }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_WRITE_ERROR"; error: string | null }
  | { type: "CLEAR_WRITE_ERROR" };

// ── Reducer ────────────────────────────────────────────────────────

function initialDomain(source: DataSource): DomainEntry {
  return { data: [], source, syncedAt: null };
}

function initialState(): AppStateSnapshot {
  return {
    domains: Object.fromEntries(
      ALL_DOMAIN_KEYS.map((d) => [d, initialDomain("unavailable")]),
    ) as Record<DomainKey, DomainEntry>,
    loading: false,
    error: null,
    writeError: null,
    readOnly: false,
  };
}

function computeReadOnly(domains: Record<DomainKey, DomainEntry>): boolean {
  return ESSENTIAL_DOMAIN_KEYS.some((d) => STALE_SOURCES.includes(domains[d].source));
}

export function appStateReducer(
  state: AppStateSnapshot | undefined,
  action: AppStateAction,
): AppStateSnapshot {
  if (state === undefined) {
    state = initialState();
  }

  switch (action.type) {
    case "BOOTSTRAP_START": {
      return {
        ...initialState(),
        loading: true,
        domains: Object.fromEntries(
          ALL_DOMAIN_KEYS.map((d) => [d, initialDomain("unavailable")]),
        ) as Record<DomainKey, DomainEntry>,
      };
    }

    case "BOOTSTRAP_COMPLETE": {
      return { ...state, loading: false };
    }

    case "BOOTSTRAP_401": {
      return { ...state, loading: false };
    }

    case "DOMAIN_LIVE": {
      const domains = {
        ...state.domains,
        [action.domain]: {
          data: action.data,
          source: "live" as DataSource,
          syncedAt: action.syncedAt,
        },
      };
      return { ...state, domains, readOnly: computeReadOnly(domains) };
    }

    case "DOMAIN_SNAPSHOT": {
      const domains = {
        ...state.domains,
        [action.domain]: {
          data: action.data,
          source: "snapshot" as DataSource,
          syncedAt: action.syncedAt,
        },
      };
      return { ...state, domains, readOnly: computeReadOnly(domains) };
    }

    case "DOMAIN_UNAVAILABLE": {
      const domains = {
        ...state.domains,
        [action.domain]: initialDomain("unavailable"),
      };
      return { ...state, domains, readOnly: computeReadOnly(domains) };
    }

    case "SET_ERROR": {
      return { ...state, error: action.error };
    }

    case "SET_WRITE_ERROR": {
      return { ...state, writeError: action.error };
    }

    case "CLEAR_WRITE_ERROR": {
      return { ...state, writeError: null };
    }

    default: {
      // Unknown action → return unchanged (pure reducer invariant)
      return state;
    }
  }
}
