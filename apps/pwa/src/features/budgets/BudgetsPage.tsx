"use client";

import { useMemo, useState } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import { useAppState } from "@/lib/state/app-state-context";

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatInputBRL(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const intPart = padded.slice(0, -2);
  const decPart = padded.slice(-2);
  return `${parseInt(intPart, 10).toLocaleString("pt-BR")},${decPart}`;
}

function NewBudgetSheet({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: { id: string; name: string; kind: string; icon?: string }[];
}) {
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");

  const expenseCategories = categories.filter((c) => c.kind === "expense");

  function handleSave() {
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Novo orçamento">
      <div className="flex flex-col gap-4">
        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Categoria
          </label>
          {expenseCategories.length === 0 ? (
            <div className="rounded-[12px] bg-fill-light px-3 py-3 text-center text-[12px] text-text-muted">
              Crie primeiro uma categoria de despesa.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {expenseCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id === categoryId ? "" : c.id)}
                  className={`rounded-[100px] px-3.5 py-2 text-[12px] font-bold transition-colors ${
                    categoryId === c.id
                      ? "bg-primary text-white"
                      : "bg-fill-light text-text-secondary"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Limite mensal
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[16px] font-semibold text-text-secondary">
              R$
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                if (raw.length > 12) return;
                setAmount(formatInputBRL(raw));
              }}
              placeholder="0,00"
              className="w-full rounded-[13px] border border-border bg-transparent py-3 pl-11 pr-3.5 font-mono text-[16px] font-semibold text-text-primary outline-none transition-colors focus:border-primary"
            />
          </div>
        </fieldset>

        <button
          type="button"
          onClick={handleSave}
          className="mt-2 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90"
        >
          Salvar orçamento
        </button>
      </div>
    </BottomSheet>
  );
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function BudgetsPage() {
  const { budgets, categories, loading, error } = useAppState();
  const [tab, setTab] = useState<"expense" | "income">("expense");
  const [createOpen, setCreateOpen] = useState(false);

  const expenseBudgets = useMemo(
    () =>
      budgets.filter((b) => {
        const cat = categories.find((c) => c.id === b.categoryId);
        return cat?.kind === "expense" || !cat;
      }),
    [budgets, categories],
  );

  const incomeBudgets = useMemo(
    () =>
      budgets.filter((b) => {
        const cat = categories.find((c) => c.id === b.categoryId);
        return cat?.kind === "income";
      }),
    [budgets, categories],
  );

  const visibleBudgets = tab === "expense" ? expenseBudgets : incomeBudgets;

  const totalSpent = visibleBudgets.reduce(
    (s, b) => s + b.spentCents,
    0,
  );
  const totalLimit = visibleBudgets.reduce(
    (s, b) => s + b.amountCents,
    0,
  );

  function getCategoryIcon(categoryId: string) {
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.icon ?? "";
  }

  function getCategoryColor(categoryId: string): string {
    const map: Record<string, string> = {
      UtensilsCrossed: "#0E8C5A",
      Car: "#B8791F",
      Home: "#3E6FB0",
      Heart: "#C8483B",
      DollarSign: "#0E8C5A",
      Laptop: "#3E6FB0",
    };
    return map[getCategoryIcon(categoryId)] ?? "#98A29A";
  }

  function getCategoryTint(categoryId: string): string {
    const map: Record<string, string> = {
      UtensilsCrossed: "#E7F3EC",
      Car: "#FBF1E3",
      Home: "#E8EFF7",
      Heart: "#F7E9E7",
      DollarSign: "#E7F3EC",
      Laptop: "#E8EFF7",
    };
    return map[getCategoryIcon(categoryId)] ?? "#F4F5F2";
  }

  const barColor = (pct: number) => {
    if (pct >= 100) return "var(--color-danger)";
    if (pct >= 80) return "var(--color-warning)";
    return "var(--color-primary)";
  };

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
        <PageHeader
          title="Orçamentos"
          action={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-primary px-[15px] py-[9px] text-[12px] font-bold text-white"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Novo
            </button>
          }
        />

        {error && (
          <div className="mx-5 mb-3 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger">
            ⚠ {error}
          </div>
        )}

        <WriteErrorBanner message={writeError} onDismiss={clearWriteError} />

        <div className="px-5">
          {/* Tabs */}
          <div className="mb-[6px] flex gap-1.5 rounded-xl bg-fill-light p-1">
            <button
              onClick={() => setTab("expense")}
              className={`flex-1 rounded-[10px] py-2.5 text-center text-[13px] font-bold transition-colors ${
                tab === "expense"
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-muted"
              }`}
            >
              Despesas
            </button>
            <button
              onClick={() => setTab("income")}
              className={`flex-1 rounded-[10px] py-2.5 text-center text-[13px] font-bold transition-colors ${
                tab === "income"
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-muted"
              }`}
            >
              Receitas (previsão)
            </button>
          </div>

          {/* Summary */}
          <div className="mb-4 text-[13px] text-text-secondary">
            {tab === "expense" ? (
              <>
                Você usou{" "}
                <b className="text-text-primary">{formatBRL(totalSpent)}</b> de{" "}
                {formatBRL(totalLimit)}
              </>
            ) : (
              <>
                Previsão de receitas para o mês — compare com o que já entrou.
              </>
            )}
          </div>
        </div>

        {/* Budget cards */}
        <div className="flex flex-col gap-3 px-5">
          {visibleBudgets.length === 0 ? (
            <div className="py-[50px] text-center text-text-muted">
              <div className="text-[14px] font-semibold">
                Nenhum orçamento
              </div>
              <div className="mt-1 text-[12px]">
                {tab === "expense"
                  ? "Crie um orçamento de despesas para começar."
                  : "Crie uma previsão de receitas para começar."}
              </div>
            </div>
          ) : (
            visibleBudgets.map((b) => {
              const pct =
                b.amountCents > 0
                  ? Math.min((b.spentCents / b.amountCents) * 100, 100)
                  : 0;
              const color = barColor(pct);
              const icon = getCategoryIcon(b.categoryId);

              return (
                <div
                  key={b.id}
                  className="rounded-[16px] border border-border bg-surface px-4 py-4 shadow-card"
                >
                  {/* Header */}
                  <div className="mb-[9px] flex items-center justify-between">
                    <div className="flex items-center gap-[9px]">
                      <div
                        className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px]"
                        style={{ background: getCategoryTint(b.categoryId) }}
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={getCategoryColor(b.categoryId)}
                          strokeWidth="1.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {icon === "UtensilsCrossed" && (
                            <>
                              <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
                              <path d="M7 2v20" />
                              <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
                            </>
                          )}
                          {icon === "Car" && (
                            <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.5a1 1 0 0 0-.8.4L2 11v5h3m10 0a3 3 0 1 1-6 0m6 0a3 3 0 1 0-6 0" />
                          )}
                          {icon === "Home" && (
                            <path d="M3 12L12 3l9 9M5 10v9a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1v-9" />
                          )}
                          {icon === "Heart" && (
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                          )}
                          {icon === "DollarSign" && (
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          )}
                          {icon === "Laptop" && (
                            <path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1 3H3l1-3" />
                          )}
                        </svg>
                      </div>
                      <span className="text-[14px] font-semibold text-text-primary">
                        {b.name}
                      </span>
                    </div>
                    <span
                      className="font-mono text-[13px] font-bold"
                      style={{ color }}
                    >
                      {formatPct(pct)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-[9px] h-2 rounded-full bg-fill-medium">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>

                  {/* Labels */}
                  <div className="flex justify-between text-[11px] text-text-muted">
                    <span>
                      {formatBRL(b.spentCents)}{" "}
                      {tab === "expense" ? "gasto" : "recebido"}
                    </span>
                    <span>
                      de {formatBRL(b.amountCents)}{" "}
                      {tab === "income" ? "previsto" : ""}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      <NewBudgetSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        categories={categories}
      />
    </div>
  );
}
