"use client";

import { useState, useMemo } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import { useAppState } from "@/lib/state/app-state-context";

type TypeFilter = "all" | "expense" | "income" | "transfer";
type PeriodFilter = "all" | 7 | 30 | 90;

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";

  return d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
  });
}

interface Group {
  label: string;
  date: string;
  items: Transaction[];
}

import type { Transaction } from "@/lib/state/types";

function categoryIconPaths(iconName: string): { d: string; tint: string; stroke: string } {
  const map: Record<string, { d: string; tint: string; stroke: string }> = {
    UtensilsCrossed: { d: "M17 2v4M7 2v4M3 6h18v1a6 6 0 0 1-6 6h-2", tint: "#E7F3EC", stroke: "#0E8C5A" },
    Car: { d: "M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.5a1 1 0 0 0-.8.4L2 11v5h3m10 0a3 3 0 1 1-6 0m6 0a3 3 0 1 0-6 0", tint: "#FBF1E3", stroke: "#B8791F" },
    Home: { d: "M3 12L12 3l9 9M5 10v9a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1v-9", tint: "#E8EFF7", stroke: "#3E6FB0" },
    Heart: { d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z", tint: "#F7E9E7", stroke: "#C8483B" },
    DollarSign: { d: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", tint: "#E7F3EC", stroke: "#0E8C5A" },
    Laptop: { d: "M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1 3H3l1-3", tint: "#E8EFF7", stroke: "#3E6FB0" },
  };
  return map[iconName] ?? { d: "", tint: "#F4F5F2", stroke: "#98A29A" };
}

export default function RecordsPage() {
  const { transactions, categories, accounts, loading, error } = useAppState();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let result = [...transactions];

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((t) => t.kind === typeFilter);
    }

    // Period filter
    if (periodFilter !== "all") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - periodFilter);
      result = result.filter(
        (t) => new Date(t.date + "T12:00:00") >= cutoff,
      );
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          (t.recipientName?.toLowerCase().includes(q) ?? false),
      );
    }

    // Category filter
    if (categoryFilter) {
      result = result.filter((t) => t.categoryId === categoryFilter);
    }

    // Sort by date descending
    result.sort((a, b) => b.date.localeCompare(a.date));
    return result;
  }, [transactions, typeFilter, periodFilter, search, categoryFilter]);

  // Group by date
  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of filtered) {
      const existing = map.get(tx.date) ?? [];
      existing.push(tx);
      map.set(tx.date, existing);
    }
    const result: Group[] = [];
    for (const [date, items] of map) {
      result.push({ label: formatDateLabel(date), date, items });
    }
    result.sort((a, b) => b.date.localeCompare(a.date));
    return result;
  }, [filtered]);

  function getCategoryName(categoryId: string): string {
    return categories.find((c) => c.id === categoryId)?.name ?? "";
  }

  function getAccountName(accountId: string): string {
    return accounts.find((a) => a.id === accountId)?.name ?? "";
  }

  const chips: { key: TypeFilter; label: string }[] = [
    { key: "all", label: "Tudo" },
    { key: "expense", label: "Despesas" },
    { key: "income", label: "Receitas" },
    { key: "transfer", label: "Transf." },
  ];

  const periodChips: { key: PeriodFilter; label: string }[] = [
    { key: 7, label: "7d" },
    { key: 30, label: "30d" },
    { key: 90, label: "90d" },
  ];

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <StatusBar />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-fill-medium border-t-primary" />
            <span className="text-[13px] font-semibold text-text-muted">Carregando...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />
      <main className="flex flex-1 flex-col pb-[var(--tab-bar-height)]">
        <PageHeader title="Registros" />

        {error && (
          <div className="mx-5 mb-3 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger">
            ⚠ {error}
          </div>
        )}

        {/* Search */}
        <div className="mx-5 mb-3">
          <div className="flex items-center gap-2 rounded-[12px] border border-border bg-surface px-3.5 py-2.5">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar lançamento"
              className="w-full border-none bg-transparent text-[13px] text-text-primary outline-none"
            />
          </div>
        </div>

        {/* Type + Period filters */}
        <div className="scrollbar-hide mx-5 mb-3 flex gap-2 overflow-x-auto">
          {chips.map((chip) => (
            <button
              key={chip.key}
              onClick={() =>
                setTypeFilter(chip.key === typeFilter ? "all" : chip.key)
              }
              className={`flex-none rounded-[100px] px-3.5 py-2 text-[12px] font-bold transition-colors ${
                typeFilter === chip.key
                  ? "bg-primary text-white"
                  : "bg-fill-light text-text-secondary"
              }`}
            >
              {chip.label}
            </button>
          ))}
          <span className="mx-1 my-1 w-px bg-border-strong" />
          {periodChips.map((chip) => (
            <button
              key={chip.label}
              onClick={() =>
                setPeriodFilter(
                  chip.key === periodFilter ? "all" : chip.key,
                )
              }
              className={`flex-none rounded-[100px] px-3.5 py-2 text-[12px] font-bold transition-colors ${
                periodFilter === chip.key
                  ? "bg-primary text-white"
                  : "bg-fill-light text-text-secondary"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Category filter chips */}
        {categories.length > 0 && (
          <div className="scrollbar-hide mx-5 mb-4 flex gap-1.5 overflow-x-auto">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`flex-none rounded-[100px] px-3 py-1.5 text-[11px] font-bold transition-colors ${
                categoryFilter === null
                  ? "bg-primary text-white"
                  : "bg-fill-light text-text-secondary"
              }`}
            >
              Todas
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() =>
                  setCategoryFilter(categoryFilter === c.id ? null : c.id)
                }
                className={`flex-none rounded-[100px] px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  categoryFilter === c.id
                    ? "bg-primary text-white"
                    : "bg-fill-light text-text-secondary"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {filtered.length === 0 ? (
          <div className="px-5 py-[50px] text-center text-text-muted">
            <div className="text-[14px] font-semibold">Nada encontrado</div>
            <div className="mt-1 text-[12px]">
              Ajuste a busca ou os filtros.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-5">
            {groups.map((group) => (
              <div key={group.date}>
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  {group.label}
                </div>
                <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
                  {group.items.map((tx) => {
                    const cat = categories.find(
                      (c) => c.id === tx.categoryId,
                    );
                    const ico = categoryIconPaths(cat?.icon ?? "");
                    const amountColor =
                      tx.kind === "expense"
                        ? "var(--color-danger)"
                        : tx.kind === "income"
                          ? "var(--color-primary)"
                          : "var(--color-info)";
                    const prefix =
                      tx.kind === "expense"
                        ? "−"
                        : tx.kind === "income"
                          ? "+"
                          : "";

                    return (
                      <div
                        key={tx.id}
                        className="flex items-center gap-3 border-b border-fill-medium px-4 py-3 last:border-none"
                      >
                        <div
                          className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px]"
                          style={{
                            background: ico.tint,
                          }}
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={ico.stroke}
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d={ico.d} />
                          </svg>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold text-text-primary">
                            {tx.description}
                          </div>
                          <div className="text-[11px] text-text-muted">
                            {getCategoryName(tx.categoryId)}
                            {tx.categoryId && " · "}
                            {getAccountName(tx.accountId)}
                          </div>
                        </div>
                        <div
                          className="flex-none font-mono text-[13px] font-semibold"
                          style={{ color: amountColor }}
                        >
                          {prefix}
                          {formatBRL(tx.amountCents)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
