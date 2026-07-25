"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import { WriteErrorBanner } from "@/components/WriteErrorBanner";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { StaleBanner } from "@/components/StaleBanner";
import Skeleton from "@/components/ui/Skeleton";
import { TransactionActionSheet } from "./components/TransactionActionSheet";
import { TransactionEditSheet } from "./components/TransactionEditSheet";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { useAppState } from "@/lib/state/app-state-context";
import type { Transaction } from "@/lib/state/types";

// Edge-fade mask that visually hints "this row scrolls horizontally".
// Applied to overflow-x-auto rows so the leftmost/rightmost chips appear
// to fade into the page edge, signalling more content off-screen.
// Uses percentages instead of `calc(...)` to stay compatible with jsdom's
// CSSStyleDeclaration parser used in unit tests.

type TypeFilter = "all" | "expense" | "income" | "transfer";
type PeriodFilter = "all" | "today" | 7 | 30 | "month" | "custom";

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

export default function RecordsPage() {
  const { transactions, categories, accounts, loading, error, writeError, clearWriteError, deleteTransaction } = useAppState();
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePendingTx, setDeletePendingTx] = useState<Transaction | null>(null);
  const handleRowClick = useCallback((tx: Transaction) => {
    setSelectedTx(tx);
    setActionOpen(true);
  }, []);
  const handleEdit = useCallback((tx: Transaction) => {
    setActionOpen(false);
    setSelectedTx(tx);
    setEditOpen(true);
  }, []);
  const handleDelete = useCallback(
    (tx: Transaction) => {
      setDeletePendingTx(tx);
      setDeleteConfirmOpen(true);
    },
    [],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (deletePendingTx) {
      await deleteTransaction(deletePendingTx.id);
    }
    setDeleteConfirmOpen(false);
    setDeletePendingTx(null);
    setActionOpen(false);
    setSelectedTx(null);
  }, [deletePendingTx, deleteTransaction]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirmOpen(false);
    setDeletePendingTx(null);
  }, []);
  const [staleDismissed, setStaleDismissed] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [filterPage, setFilterPage] = useState<"main" | "category">("main");
  const [search, setSearch] = useState("");

  // Read ?type=&categoryId= from the URL on mount. Used by the Home
  // donut to deep-link the user onto a pre-filtered records view.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawType = params.get("type");
    if (rawType === "expense" || rawType === "income" || rawType === "transfer") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTypeFilter(rawType);
    }
    const cat = params.get("categoryId");
    if (cat) {
      setCategoryFilter(cat);
    }
    const acct = params.get("accountId");
    if (acct) {
      setAccountFilter(acct);
    }
  }, []);

  const filtered = useMemo(() => {
    let result = [...transactions];

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((t) => t.kind === typeFilter);
    }

    // Period filter
    if (periodFilter !== "all") {
      const today = new Date();
      let cutoff: Date;
      if (periodFilter === "today") {
        cutoff = new Date(today.toISOString().slice(0, 10) + "T00:00:00");
      } else if (periodFilter === "month") {
        cutoff = new Date(today.getFullYear(), today.getMonth(), 1);
      } else if (periodFilter === "custom") {
        cutoff = new Date("1970-01-01"); // handled below
      } else {
        cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - periodFilter);
      }
      result = result.filter(
        (t) => new Date(t.date + "T12:00:00") >= cutoff,
      );
    }

    // Custom date range
    if (periodFilter === "custom") {
      if (customStartDate) {
        result = result.filter((t) => t.date >= customStartDate);
      }
      if (customEndDate) {
        result = result.filter((t) => t.date <= customEndDate);
      }
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

    // Account filter
    if (accountFilter) {
      result = result.filter((t) => t.accountId === accountFilter);
    }

    // Category filter
    if (categoryFilter) {
      result = result.filter((t) => t.categoryId === categoryFilter);
    }

    // Sort by date descending
    result.sort((a, b) => b.date.localeCompare(a.date));
    return result;
  }, [transactions, typeFilter, periodFilter, search, categoryFilter, accountFilter, customStartDate, customEndDate]);

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
    { key: "today", label: "Hoje" },
    { key: 7, label: "7d" },
    { key: 30, label: "30d" },
    { key: "month", label: "Este mês" },
    { key: "custom", label: "Personalizado" },
  ];

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <StatusBar />
        <PageHeader title="Registros" />
        <main className="flex flex-1 flex-col gap-3 px-5 pb-[var(--tab-bar-height)] sm:px-8 lg:px-12">
          {/* Search skeleton */}
          <Skeleton variant="card" height={42} />
          {/* Filter chip rows skeleton */}
          <div className="flex gap-2">
            <Skeleton width={64} height={30} />
            <Skeleton width={88} height={30} />
            <Skeleton width={80} height={30} />
            <Skeleton width={56} height={30} />
            <Skeleton width={56} height={30} />
          </div>
          {/* Transaction groups skeleton */}
          {[0, 1, 2].map((g) => (
            <div key={g} className="flex flex-col gap-2">
              <Skeleton variant="text" width={70} height={10} />
              <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
                {[0, 1, 2].map((r) => (
                  <div
                    key={r}
                    className="flex items-center gap-3 border-b border-fill-medium px-4 py-3 last:border-none"
                  >
                    <Skeleton variant="circle" width={38} height={38} />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Skeleton variant="text" width="70%" />
                      <Skeleton variant="text" width="40%" height={9} />
                    </div>
                    <Skeleton variant="text" width={70} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </main>
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

        <WriteErrorBanner
          message={writeError}
          onDismiss={clearWriteError}
          onRetry={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
        />

        {!staleDismissed && (
          <StaleBanner
            domains={["transactions", "categories", "accounts"]}
            onRetry={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            onDismiss={() => setStaleDismissed(true)}
          />
        )}

        {/* Search */}
        <div className="mx-5 mb-3 sm:mx-8 lg:mx-12">
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

        {/* Compact filter trigger */}
        <div className="mx-5 mb-3 sm:mx-8 lg:mx-12">
          <button
            data-testid="filter-trigger"
            onClick={() => setFilterOpen(true)}
            className="flex w-full items-center gap-2 rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-left text-[13px] font-semibold text-text-primary"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
            </svg>
            Filtro
            {typeFilter !== "all" && <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">{chips.find((c) => c.key === typeFilter)?.label}</span>}
            {periodFilter !== "all" && periodFilter !== "custom" && <span className="rounded-full bg-fill-light px-2 py-0.5 text-[10px] font-bold text-text-secondary">{
              periodFilter === "today" ? "Hoje" :
              periodFilter === "month" ? "Este mês" :
              `${periodFilter}d`
            }</span>}
            {periodFilter === "custom" && (customStartDate || customEndDate) && <span className="rounded-full bg-fill-light px-2 py-0.5 text-[10px] font-bold text-text-secondary">Personalizado</span>}
            {accountFilter && <span className="rounded-full bg-fill-light px-2 py-0.5 text-[10px] font-bold text-text-secondary">{accounts.find((a) => a.id === accountFilter)?.name}</span>}
            {categoryFilter && <span className="rounded-full bg-fill-light px-2 py-0.5 text-[10px] font-bold text-text-secondary">{categories.find((c) => c.id === categoryFilter)?.name}</span>}
          </button>
        </div>

        {/* Filter BottomSheet */}
        <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filtros">
          {/* Type */}
          <div className="mb-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">Tipo</div>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => {
                    setTypeFilter(chip.key === typeFilter ? "all" : chip.key);
                    setFilterOpen(false);
                  }}
                  className={`rounded-[100px] px-3.5 py-2 text-[12px] font-bold transition-colors ${
                    typeFilter === chip.key
                      ? "bg-primary text-white"
                      : "bg-fill-light text-text-secondary"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Period */}
          <div className="mb-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">Período</div>
            <div className="flex flex-wrap gap-1.5">
              {periodChips.map((chip) => (
                <button
                  key={String(chip.key)}
                  onClick={() => {
                    setPeriodFilter(chip.key === periodFilter ? "all" : chip.key);
                    if (chip.key !== "custom") setFilterOpen(false);
                  }}
                  className={`rounded-[100px] px-3.5 py-2 text-[12px] font-bold transition-colors ${
                    periodFilter === chip.key
                      ? "bg-primary text-white"
                      : "bg-fill-light text-text-secondary"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            {/* Custom date inputs — visible only when Personalizado is active */}
            {periodFilter === "custom" && (
              <div className="mt-3 flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Data inicial</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-[12px] text-text-primary outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Data final</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-[12px] text-text-primary outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Category — single selector trigger */}
          {categories.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">Categoria</div>
              {filterPage === "main" ? (
                <button
                  data-testid="category-selector-trigger"
                  onClick={() => setFilterPage("category")}
                  className="flex w-full items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5 text-left text-[13px] font-semibold text-text-primary"
                >
                  {categoryFilter
                    ? categories.find((c) => c.id === categoryFilter)?.name ?? "Categoria"
                    : "Todas as categorias"}
                  <svg className="ml-auto" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              ) : (
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => setFilterPage("main")}
                    className="mb-1 flex items-center gap-1 text-[12px] font-semibold text-primary"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                    Voltar
                  </button>
                  <button
                    onClick={() => {
                      setCategoryFilter(null);
                      setFilterPage("main");
                    }}
                    className={`w-full rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${
                      categoryFilter === null ? "bg-primary-tint text-primary" : "text-text-primary hover:bg-fill-light"
                    }`}
                  >
                    Todas as categorias
                  </button>
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCategoryFilter(c.id);
                        setFilterPage("main");
                      }}
                      className={`w-full rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${
                        categoryFilter === c.id ? "bg-primary-tint text-primary" : "text-text-primary hover:bg-fill-light"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => {
              setTypeFilter("all");
              setPeriodFilter("all");
              setCategoryFilter(null);
              setFilterOpen(false);
            }}
            className="mt-2 w-full rounded-[12px] border border-border bg-surface py-3 text-[13px] font-semibold text-text-secondary"
          >
            Limpar filtros
          </button>
        </BottomSheet>

        {/* Content */}
        {filtered.length === 0 ? (
          <div className="px-5 py-[50px] text-center text-text-muted sm:px-8 lg:px-12">
            <div className="text-[14px] font-semibold">Nada encontrado</div>
            <div className="mt-1 text-[12px]">
              Ajuste a busca ou os filtros.
            </div>
          </div>
        ) : (
          <div data-testid="records-groups" className="flex flex-col gap-4 px-5 sm:px-8 lg:px-12">
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
                        onClick={() => handleRowClick(tx)}
                        className="flex cursor-pointer items-center gap-3 border-b border-fill-medium px-4 py-3 last:border-none active:bg-fill-light"
                      >
                        <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-fill-light">
                          <CategoryBadge
                            name={cat?.name ?? ""}
                            size={22}
                          />
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

      <TransactionActionSheet
        open={actionOpen}
        transaction={selectedTx}
        onClose={() => {
          setActionOpen(false);
          setSelectedTx(null);
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <TransactionEditSheet
        open={editOpen}
        transaction={selectedTx}
        onClose={() => {
          setEditOpen(false);
          setSelectedTx(null);
        }}
      />

      <ConfirmActionDialog
        open={deleteConfirmOpen}
        title="Excluir lan\u00e7amento"
        message="Esta a\u00e7\u00e3o n\u00e3o pode ser desfeita. Deseja realmente excluir?"
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
}
