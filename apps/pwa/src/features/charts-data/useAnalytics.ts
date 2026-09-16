"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAnalyticsJson } from "@/lib/api/endpoints";
import type { AnalyticsFilters } from "@/components/filters/analytics-filters";

export type AnalyticsKpis = {
  period: { from: string; to: string };
  previousPeriod: { from: string; to: string };
  netLiquidBalanceCents: number;
  accountsTotalCents: number;
  dueSoonCents: number;
  openInvoices: { committedCents: number; limitCents: number; utilizationPct: number | null };
  savingsRatePct: number | null;
  savingsRateTargetPct: number;
  previousSavingsRatePct: number | null;
  fixedVsDiscretionary: {
    scope: "household" | "account";
    fixedCents: number;
    discretionaryCents: number;
    fixedPctOfIncome: number | null;
    /** Household-wide subscriptions component (H-10: never account-scoped). */
    subscriptionsCents: number;
  };
  incomeCents: number;
  expenseCents: number;
  previousIncomeCents: number;
  previousExpenseCents: number;
  netWorthCents: number;
};

export type CashflowSeries = {
  period: { from: string; to: string };
  current: { date: string; valueCents: number }[];
  previous: { date: string; valueCents: number }[];
};

export type CategorySlice = {
  categoryId: string;
  name: string;
  totalCents: number;
  pct: number;
  color: string | null;
};

export type CategoryBreakdown = {
  period: { from: string; to: string };
  kind: "expense" | "income";
  totalCents: number;
  slices: CategorySlice[];
};

export type BudgetConsumptionItem = {
  budgetId: string;
  name: string;
  categoryId: string;
  spentCents: number;
  amountCents: number;
  pctUsed: number;
  overBudget: boolean;
  thresholdBreached: boolean;
};

export type HeatmapWeek = {
  weekStart: string;
  days: { date: string; totalCents: number; level: 0 | 1 | 2 | 3 | 4 }[];
};

const toQuery = (filters: AnalyticsFilters): string => {
  const params = new URLSearchParams({ period: filters.period });
  if (filters.period === "custom" && filters.from && filters.to) {
    params.set("from", filters.from);
    params.set("to", filters.to);
  }
  if (filters.accountId) params.set("accountId", filters.accountId);
  return params.toString();
};

export async function fetchKpis(filters: AnalyticsFilters, signal?: AbortSignal): Promise<AnalyticsKpis> {
  return fetchAnalyticsJson<AnalyticsKpis>(`/analytics/kpis?${toQuery(filters)}`, signal);
}

export async function fetchCashflowSeries(filters: AnalyticsFilters, signal?: AbortSignal): Promise<CashflowSeries> {
  return fetchAnalyticsJson<CashflowSeries>(`/analytics/cashflow-series?${toQuery(filters)}`, signal);
}

export async function fetchCategoryBreakdown(
  filters: AnalyticsFilters,
  kind: "expense" | "income" = "expense",
  signal?: AbortSignal,
): Promise<CategoryBreakdown> {
  const query = toQuery(filters);
  return fetchAnalyticsJson<CategoryBreakdown>(`/analytics/category-breakdown?${query}&kind=${kind}`, signal);
}

export async function fetchBudgetConsumption(signal?: AbortSignal): Promise<BudgetConsumptionItem[]> {
  const res = await fetchAnalyticsJson<{ items: BudgetConsumptionItem[] }>("/analytics/budget-consumption", signal);
  return res.items;
}

export async function fetchDailyHeatmap(
  filters: AnalyticsFilters,
  signal?: AbortSignal,
): Promise<{ endDate: string; weeks: HeatmapWeek[] }> {
  return fetchAnalyticsJson(`/analytics/daily-heatmap?${toQuery(filters)}`, signal);
}

export async function fetchNetWorthHistory(
  filters: AnalyticsFilters,
  signal?: AbortSignal,
): Promise<{ month: string; netWorthCents: number }[]> {
  const res = await fetchAnalyticsJson<{ months: { month: string; netWorthCents: number }[] }>(
    `/analytics/net-worth-history?${toQuery(filters)}`,
    signal,
  );
  return res.months;
}

export type AnalyticsBundle = {
  kpis: AnalyticsKpis | null;
  cashflow: CashflowSeries | null;
  breakdown: CategoryBreakdown | null;
  budgets: BudgetConsumptionItem[];
  heatmap: { endDate: string; weeks: HeatmapWeek[] } | null;
  netWorth: { month: string; netWorthCents: number }[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export type UseAnalyticsOptions = {
  /**
   * Quando false, pula o fetch de `/analytics/daily-heatmap` e mantém
   * `heatmap` como null (ex.: Home, que não exibe o heatmap).
   * Padrão true para preservar o comportamento de Reports.
   */
  includeHeatmap?: boolean;
};

/**
 * Carrega o pacote de analytics para os filtros atuais (etapa A: dados
 * prontos para a etapa B montar Home e /hub/relatorios).
 */
export function useAnalytics(filters: AnalyticsFilters, options?: UseAnalyticsOptions): AnalyticsBundle {
  const [kpis, setKpis] = useState<AnalyticsKpis | null>(null);
  const [cashflow, setCashflow] = useState<CashflowSeries | null>(null);
  const [breakdown, setBreakdown] = useState<CategoryBreakdown | null>(null);
  const [budgets, setBudgets] = useState<BudgetConsumptionItem[]>([]);
  const [heatmap, setHeatmap] = useState<{ endDate: string; weeks: HeatmapWeek[] } | null>(null);
  const [netWorth, setNetWorth] = useState<{ month: string; netWorthCents: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const includeHeatmap = options?.includeHeatmap ?? true;

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void Promise.resolve().then(() => {
      setLoading(true);
      setError(null);
      if (!includeHeatmap) setHeatmap(null);
    });
    void Promise.all([
      fetchKpis(filters, controller.signal).then(setKpis),
      fetchCashflowSeries(filters, controller.signal).then(setCashflow),
      fetchCategoryBreakdown(filters, "expense", controller.signal).then(setBreakdown),
      fetchBudgetConsumption(controller.signal).then(setBudgets),
      includeHeatmap
        ? fetchDailyHeatmap(filters, controller.signal).then(setHeatmap)
        : Promise.resolve(),
      fetchNetWorthHistory(filters, controller.signal).then(setNetWorth),
    ])
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name !== "AbortError") {
          setError(e instanceof Error ? e.message : "Falha ao carregar analytics.");
        }
      })
      .finally(() => {
        if (abortRef.current === controller) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.period, filters.from, filters.to, filters.accountId, nonce, includeHeatmap]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { kpis, cashflow, breakdown, budgets, heatmap, netWorth, loading, error, reload };
}
