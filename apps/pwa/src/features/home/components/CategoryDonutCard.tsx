"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBRL } from "@/lib/format/brl";
import type { MacroSlice } from "../hooks/useCategoryBreakdown";
import { PieChart } from "lucide-react";

const CATEGORY_PALETTE = [
  { color: "#0E8C5A", tint: "#E7F3EC" },
  { color: "#C8483B", tint: "#F7E9E7" },
  { color: "#B8791F", tint: "#FBF1E3" },
  { color: "#3E6FB0", tint: "#E8EFF7" },
  { color: "#2FA56F", tint: "#E7F3EC" },
  { color: "#820AD1", tint: "#EEE9F7" },
  { color: "#EC7000", tint: "#FBF1E3" },
];

interface CategoryDonutCardProps {
  macros: MacroSlice[];
  totalExpenses: number | null;
  onAddExpense: () => void;
}

export function CategoryDonutCard({ macros, totalExpenses, onAddExpense }: CategoryDonutCardProps) {
  const slices = useMemo(
    () =>
      macros.map((m, i) => ({
        ...m,
        color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]!.color,
      })),
    [macros],
  );

  const donutBg = useMemo(() => {
    if (slices.length === 0) return "#F1F3EF";
    let cumulative = 0;
    const parts: string[] = [];
    for (const c of slices) {
      const start = cumulative;
      const end = cumulative + (c.pct / 100) * 360;
      parts.push(`${c.color} ${start}deg ${end}deg`);
      cumulative = end;
    }
    parts.push(`var(--surface-2) ${cumulative}deg 360deg`);
    return `conic-gradient(${parts.join(", ")})`;
  }, [slices]);

  return (
    <div className="mb-[14px] rounded-[18px] border border-border-subtle bg-surface-1 px-4 py-4 shadow-card">
      <div className="mb-3.5 flex items-center justify-between">
        <span className="text-[13px] font-bold text-text-primary">
          Gastos por categoria
        </span>
        <span className="font-mono tabular-nums text-[12px] font-semibold text-text-primary">
          Total: {totalExpenses !== null ? formatBRL(totalExpenses) : "—"}
        </span>
      </div>
      {slices.length === 0 ? (
        <EmptyState
          icon={<PieChart size={24} />}
          title="Sem despesas no período"
          description="Registre sua primeira despesa para ver a distribuição por categoria."
          action={
            <Button size="sm" onClick={onAddExpense}>
              Registrar despesa
            </Button>
          }
        />
      ) : (
        <div className="flex items-center gap-4">
          {/* Donut chart */}
          <div
            data-testid="category-donut"
            data-no-swipe="true"
            className="relative h-[104px] w-[104px] flex-none rounded-full shadow-inner"
            style={{ background: donutBg }}
          >
            <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-surface-1 border border-border-subtle shadow-xs">
              <span className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Total</span>
              <span className="font-mono tabular-nums text-[12px] font-bold text-text-primary">
                {totalExpenses !== null ? formatBRL(totalExpenses) : "—"}
              </span>
            </div>
          </div>
          {/* Legend list */}
          <div className="flex flex-1 flex-col gap-1.5">
            {slices.map((c, i) => (
              <div
                key={`macro-${i}`}
                data-testid="category-row"
                className="flex w-full items-center gap-2 rounded-md py-1 px-1"
              >
                <span
                  className="h-2.5 w-2.5 flex-none rounded-full"
                  style={{ background: c.color }}
                />
                <span className="flex-1 text-[12px] font-semibold text-text-secondary">
                  {c.name}
                </span>
                <span className="font-mono tabular-nums text-[11px] font-semibold text-text-muted">
                  {c.pct.toFixed(0)}%
                </span>
                <span className="font-mono tabular-nums text-[12px] font-bold text-text-primary">
                  {formatBRL(c.amountCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
