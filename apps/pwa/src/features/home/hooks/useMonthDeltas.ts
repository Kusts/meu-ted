import { useMemo } from "react";
import type { Transaction, TransactionKind } from "@/lib/state/types";

type DeltaKind = Extract<TransactionKind, "income" | "expense">;

/**
 * Variação % do mês mais recente com dados vs. mês-calendário anterior (T1).
 * Extraído de HomePage (lógica duplicada income/expense) sem mudar o cálculo.
 */
export function useMonthDeltas(
  transactions: Transaction[],
  kind: DeltaKind,
): number | null {
  return useMemo(() => {
    const months = new Map<string, number>();
    for (const t of transactions) {
      if (t.kind !== kind) continue;
      const d = new Date(t.date + "T12:00:00");
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      months.set(key, (months.get(key) ?? 0) + t.amountCents);
    }
    const sorted = Array.from(months.keys()).sort();
    if (sorted.length === 0) return null;
    const recentKey = sorted[sorted.length - 1]!;
    const [yStr, mStr] = recentKey.split("-");
    const recentYear = Number(yStr);
    const recentMonth = Number(mStr);
    const prevMonth = recentMonth === 0 ? 11 : recentMonth - 1;
    const prevYear = recentMonth === 0 ? recentYear - 1 : recentYear;
    const prevKey = `${prevYear}-${prevMonth}`;
    const curr = months.get(recentKey) ?? 0;
    const prev = months.get(prevKey) ?? 0;
    if (prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  }, [transactions, kind]);
}
