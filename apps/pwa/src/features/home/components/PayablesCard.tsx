"use client";

import { useMemo } from "react";
import { formatBRL } from "@/lib/format/brl";
import type { Payable } from "@/lib/state/types";
import { AlertCircle } from "lucide-react";

interface PayablesCardProps {
  payables: Payable[];
  onOpen: () => void;
}

export function PayablesCard({ payables, onOpen }: PayablesCardProps) {
  const { upcoming, totalPending } = useMemo(() => {
    const pending = payables.filter((p) => p.status === "pending" || p.status === "overdue");
    return {
      upcoming: payables
        .filter((p) => p.status === "pending")
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      totalPending: pending.reduce((s, p) => s + p.amountCents, 0),
    };
  }, [payables]);

  if (payables.length === 0) return null;

  return (
    <div
      onClick={onOpen}
      className="mb-[14px] cursor-pointer rounded-[18px] border border-danger/30 bg-surface-1 px-4 py-3.5 shadow-card hover:border-danger/50 transition-colors"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle size={16} className="text-danger flex-none" />
          <span className="text-[12px] font-bold text-danger">
            {`Contas a pagar · ${upcoming.length} pendente${upcoming.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <span className="font-mono tabular-nums text-[13px] font-bold text-text-primary">
          {formatBRL(totalPending)}
        </span>
      </div>

      {upcoming.slice(0, 3).map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between py-1 border-t border-border-subtle/50 first:border-none"
        >
          <div className="flex items-center gap-2">
            <span
              className="h-[6px] w-[6px] flex-none rounded-full"
              style={{
                background:
                  p.status === "overdue"
                    ? "var(--color-danger)"
                    : "var(--color-warning)",
              }}
            />
            <span className="text-[13px] font-medium text-text-primary">
              {p.description}
            </span>
            <span
              className="text-[10px] font-bold"
              style={{
                color:
                  p.status === "overdue"
                    ? "var(--color-danger)"
                    : "var(--color-warning)",
              }}
            >
              {p.status === "overdue" ? "Vencida" : p.dueDate}
            </span>
          </div>
          <span className="font-mono tabular-nums text-[13px] font-semibold text-text-primary">
            {formatBRL(p.amountCents)}
          </span>
        </div>
      ))}
    </div>
  );
}
