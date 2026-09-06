"use client";

import { TrendingUp, TrendingDown } from "lucide-react";

interface DeltaCardsProps {
  incomeDeltaPct: number | null;
  expenseDeltaPct: number | null;
}

export function DeltaCards({ incomeDeltaPct, expenseDeltaPct }: DeltaCardsProps) {
  return (
    <div
      data-testid="kpi-delta-row"
      className="mb-[14px] grid grid-cols-2 gap-2.5 sm:gap-4 lg:gap-6"
    >
      <div className="rounded-[18px] border border-border-subtle bg-surface-1 p-3.5 shadow-card">
        <div className="mb-[2px] text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Receitas
        </div>
        <div className="mb-[6px] text-[10px] text-text-muted font-medium">
          vs mês anterior
        </div>
        <div
          className="flex items-center gap-1.5 text-primary"
          title="Variação de receitas do mês atual comparado ao mês anterior"
          aria-label="Variação de receitas do mês atual comparado ao mês anterior"
        >
          <TrendingUp size={16} strokeWidth={2.4} />
          <span className="font-mono tabular-nums text-[18px] font-bold">
            {incomeDeltaPct === null ? "—" : `${incomeDeltaPct >= 0 ? "+" : ""}${incomeDeltaPct.toFixed(0)}%`}
          </span>
        </div>
      </div>
      <div className="rounded-[18px] border border-border-subtle bg-surface-1 p-3.5 shadow-card">
        <div className="mb-[2px] text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Despesas
        </div>
        <div className="mb-[6px] text-[10px] text-text-muted font-medium">
          vs mês anterior
        </div>
        <div
          className="flex items-center gap-1.5"
          title="Variação de despesas do mês atual comparado ao mês anterior"
          aria-label="Variação de despesas do mês atual comparado ao mês anterior"
          style={{
            color:
              expenseDeltaPct === null
                ? "var(--color-text-muted)"
                : expenseDeltaPct <= 0
                  ? "var(--color-primary)"
                  : "var(--color-danger)",
          }}
        >
          {expenseDeltaPct !== null && expenseDeltaPct > 0 ? (
            <TrendingDown size={16} strokeWidth={2.4} />
          ) : (
            <TrendingUp size={16} strokeWidth={2.4} />
          )}
          <span className="font-mono tabular-nums text-[18px] font-bold">
            {expenseDeltaPct === null
              ? "—"
              : `${expenseDeltaPct >= 0 ? "+" : ""}${expenseDeltaPct.toFixed(0)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}
