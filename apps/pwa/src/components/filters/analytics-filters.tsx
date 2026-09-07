"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AnalyticsPeriod = "last30days" | "lastMonth" | "thisYear" | "custom";

export type AnalyticsFilters = {
  period: AnalyticsPeriod;
  from?: string;
  to?: string;
  accountId?: string;
};

/**
 * H-11: analytics filters are namespaced by canonical workspace + actor.
 *
 * Key shape: `meu-ted:analytics-filters:v2:<workspaceId>:<actorId>`.
 * `actorId` falls back to the explicit `no-actor` segment when the client
 * has no actor identity (documented, not silent): workspace isolation and
 * the logout wipe still apply. The server stays the authority for scope;
 * localStorage only remembers UI recency.
 */
export const ANALYTICS_FILTERS_KEY_PREFIX = "meu-ted:analytics-filters";
/** Legacy v1 global key (unscoped). Ignored on load and removed (migration). */
export const ANALYTICS_FILTERS_KEY = "meu-ted:analytics-filters";
export const ANALYTICS_FILTERS_VERSION = 2;
export const ANALYTICS_FILTERS_NO_ACTOR = "no-actor";

export type AnalyticsFiltersScope = {
  workspaceId: string;
  actorId?: string | null;
} | null;

export const scopedAnalyticsFiltersKey = (scope: AnalyticsFiltersScope): string | null => {
  if (!scope || !scope.workspaceId) return null;
  const actor = scope.actorId ? scope.actorId : ANALYTICS_FILTERS_NO_ACTOR;
  return `${ANALYTICS_FILTERS_KEY_PREFIX}:v${ANALYTICS_FILTERS_VERSION}:${scope.workspaceId}:${actor}`;
};

/**
 * Removes the legacy global key and every scoped v2 key in this browser.
 * Logout / user-switch path: also invoked by the provider when its scope
 * resolves to null. Session/logout code should call this explicitly
 * (provider unmount may race the transition).
 */
export const clearStoredAnalyticsFilters = (): void => {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key === ANALYTICS_FILTERS_KEY || (key !== null && key.startsWith(`${ANALYTICS_FILTERS_KEY_PREFIX}:`))) {
        doomed.push(key);
      }
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    // storage indisponível: nada a limpar
  }
};

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsFilters = { period: "last30days" };

const isValid = (value: unknown): value is AnalyticsFilters => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!["last30days", "lastMonth", "thisYear", "custom"].includes(String(v.period))) return false;
  if (v.from !== undefined && typeof v.from !== "string") return false;
  if (v.to !== undefined && typeof v.to !== "string") return false;
  if (v.accountId !== undefined && typeof v.accountId !== "string") return false;
  return true;
};

type StoredEnvelope = { version?: unknown; filters?: unknown };

const loadStored = (key: string | null): AnalyticsFilters => {
  // No scope (logged out / unknown workspace): memory-only defaults.
  // Persisting globally is exactly the H-11 bug, so null never reads.
  if (!key) return DEFAULT_ANALYTICS_FILTERS;
  try {
    // One-way migration: the legacy global key is never read, only removed.
    window.localStorage.removeItem(ANALYTICS_FILTERS_KEY);
    const raw = window.localStorage.getItem(key);
    if (!raw) return DEFAULT_ANALYTICS_FILTERS;
    const parsed: unknown = JSON.parse(raw);
    // Tolerate a bare v1-shaped payload under a scoped key (clamp it);
    // a versioned envelope with another version is obsolete → defaults.
    if (isValid(parsed)) return parsed;
    const envelope = parsed as StoredEnvelope;
    if (
      envelope &&
      typeof envelope === "object" &&
      (envelope.version === ANALYTICS_FILTERS_VERSION || envelope.version === undefined) &&
      isValid(envelope.filters)
    ) {
      return envelope.filters;
    }
    return DEFAULT_ANALYTICS_FILTERS;
  } catch {
    return DEFAULT_ANALYTICS_FILTERS;
  }
};

type AnalyticsFiltersContext = {
  filters: AnalyticsFilters;
  setPeriod: (period: AnalyticsPeriod, custom?: { from: string; to: string }) => void;
  setAccountId: (accountId?: string) => void;
  reset: () => void;
};

const Context = createContext<AnalyticsFiltersContext | null>(null);

export function AnalyticsFiltersProvider({
  children,
  workspaceId,
  actorId,
}: {
  children: ReactNode;
  /** Canonical workspace id. Null/undefined = logged out: memory-only, stored keys wiped. */
  workspaceId?: string | null;
  /** Actor id when the client knows it; otherwise the `no-actor` segment applies. */
  actorId?: string | null;
}) {
  const scopeKey = scopedAnalyticsFiltersKey(workspaceId ? { workspaceId, actorId } : null);
  const [filters, setFilters] = useState<AnalyticsFilters>(DEFAULT_ANALYTICS_FILTERS);

  // Reload whenever the scope changes: workspace switch A→B→A restores
  // each scope's own filters; logout (null) falls back to defaults.
  useEffect(() => {
    setFilters(loadStored(scopeKey));
    if (scopeKey === null) clearStoredAnalyticsFilters();
  }, [scopeKey]);

  useEffect(() => {
    if (!scopeKey) return;
    try {
      window.localStorage.setItem(scopeKey, JSON.stringify({ version: ANALYTICS_FILTERS_VERSION, filters }));
    } catch {
      // storage indisponível: filtros seguem em memória
    }
  }, [filters, scopeKey]);

  const setPeriod = useCallback((period: AnalyticsPeriod, custom?: { from: string; to: string }) => {
    setFilters((prev) =>
      period === "custom" && custom
        ? { ...prev, period, from: custom.from, to: custom.to }
        : { period, ...(prev.accountId ? { accountId: prev.accountId } : {}) },
    );
  }, []);

  const setAccountId = useCallback((accountId?: string) => {
    setFilters((prev) => (accountId ? { ...prev, accountId } : { period: prev.period, from: prev.from, to: prev.to }));
  }, []);

  const reset = useCallback(() => setFilters(DEFAULT_ANALYTICS_FILTERS), []);

  const value = useMemo(
    () => ({ filters, setPeriod, setAccountId, reset }),
    [filters, setPeriod, setAccountId, reset],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAnalyticsFilters(): AnalyticsFiltersContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useAnalyticsFilters must be used within AnalyticsFiltersProvider");
  return ctx;
}
