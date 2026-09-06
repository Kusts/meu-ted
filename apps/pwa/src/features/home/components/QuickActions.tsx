"use client";

import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight } from "lucide-react";

export type NewTxKind = "expense" | "income" | "transfer";

export function QuickActions({ onNew }: { onNew: (kind: NewTxKind) => void }) {
  return (
    <div className="px-5 pb-1 pt-3 sm:px-8 lg:px-12">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <button
          type="button"
          onClick={() => onNew("expense")}
          className="flex flex-col items-center gap-1.5 rounded-[16px] border border-border-subtle bg-surface-1 py-3.5 shadow-card transition-all hover:bg-surface-2 active:scale-[0.98]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-danger-tint text-danger">
            <ArrowUpRight size={18} strokeWidth={2.4} />
          </div>
          <span className="text-[12px] font-semibold text-text-secondary">
            Despesa
          </span>
        </button>
        <button
          type="button"
          onClick={() => onNew("income")}
          className="flex flex-col items-center gap-1.5 rounded-[16px] border border-border-subtle bg-surface-1 py-3.5 shadow-card transition-all hover:bg-surface-2 active:scale-[0.98]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-tint text-primary">
            <ArrowDownLeft size={18} strokeWidth={2.4} />
          </div>
          <span className="text-[12px] font-semibold text-text-secondary">
            Receita
          </span>
        </button>
        <button
          type="button"
          onClick={() => onNew("transfer")}
          className="flex flex-col items-center gap-1.5 rounded-[16px] border border-border-subtle bg-surface-1 py-3.5 shadow-card transition-all hover:bg-surface-2 active:scale-[0.98]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-info-tint text-info">
            <ArrowLeftRight size={18} strokeWidth={2.4} />
          </div>
          <span className="text-[12px] font-semibold text-text-secondary">
            Transferir
          </span>
        </button>
      </div>
    </div>
  );
}
