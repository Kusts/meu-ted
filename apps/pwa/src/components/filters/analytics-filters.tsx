"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AnalyticsPeriod = "last30days" | "lastMonth" | "thisYear" | "custom";

export type AnalyticsFilters = {
  period: AnalyticsPeriod;
  from?: string;
  to?: string;
  accountId?: string;
};

export const ANALYTICS_FILTERS_KEY = "meu-ted:analytics-filters";

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

const loadStored = (): AnalyticsFilters => {
  try {
    const raw = window.localStorage.getItem(ANALYTICS_FILTERS_KEY);
    if (!raw) return DEFAULT_ANALYTICS_FILTERS;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : DEFAULT_ANALYTICS_FILTERS;
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

export function AnalyticsFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<AnalyticsFilters>(DEFAULT_ANALYTICS_FILTERS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFilters(loadStored());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(ANALYTICS_FILTERS_KEY, JSON.stringify(filters));
    } catch {
      // storage indisponível: filtros seguem em memória
    }
  }, [filters, hydrated]);

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
