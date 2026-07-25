"use client";

import { useMemo, useState, useEffect } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import { WriteErrorBanner } from "@/components/WriteErrorBanner";
import { StaleBanner } from "@/components/StaleBanner";
import { useAppState } from "@/lib/state/app-state-context";
import { useFormDirtySafe } from "@/lib/unsaved-changes";

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

function parseBRLToCents(value: string): number {
  const cleaned = value.replace(/[.\s]/g, "").replace(",", ".");
  return Math.round(parseFloat(cleaned) * 100) || 0;
}

function NewBudgetSheet({
  open,
  onClose,
  onSave,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (input: {
    categoryId: string;
    name: string;
    amountCents: number;
    period: "monthly" | "quarterly" | "yearly";
    startDate: string;
  }) => void | Promise<void>;
  categories: { id: string; name: string; kind: string; icon?: string }[];
}) {
  const { markDirty, markClean } = useFormDirtySafe();
  const [step, setStep] = useState<"choose" | "form">("choose");
  const [budgetType, setBudgetType] = useState<"expense" | "income" | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryPage, setCategoryPage] = useState(false);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep("choose");
      setBudgetType(null);
      setCategoryId("");
      setAmount("");
      setCategoryPage(false);
      markClean();
    }
  }, [open, markClean]);

  const filteredCategories = budgetType
    ? categories.filter((c) => c.kind === budgetType)
    : [];

  async function handleSave() {
    if (!categoryId) return;
    const amountCents = parseBRLToCents(amount);
    if (amountCents <= 0) return;
    const cat = categories.find((c) => c.id === categoryId);
    try {
      await onSave({
        categoryId,
        name: cat?.name ?? "Orçamento",
        amountCents,
        period: "monthly" as const,
        startDate: new Date().toISOString().slice(0, 10),
      });
      markClean();
      onClose();
    } catch {
      // Save failed: keep dirty.
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={step === "choose" ? "Novo orçamento" : `Orçamento de ${budgetType === "expense" ? "despesa" : "receita"}`}>
      {step === "choose" ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { markDirty(); setBudgetType("expense"); setStep("form"); }}
              className="flex-1 rounded-[16px] border-2 border-border bg-surface p-5 text-center transition-colors hover:border-primary"
            >
              <div className="text-[16px] font-bold text-text-primary">Orçamento de despesa</div>
              <div className="mt-1 text-[12px] text-text-muted">Defina um limite de gastos mensal por categoria.</div>
            </button>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { markDirty(); setBudgetType("income"); setStep("form"); }}
              className="flex-1 rounded-[16px] border-2 border-border bg-surface p-5 text-center transition-colors hover:border-primary"
            >
              <div className="text-[16px] font-bold text-text-primary">Previsão de receita</div>
              <div className="mt-1 text-[12px] text-text-muted">Acompanhe quanto espera receber por mês.</div>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4" onChangeCapture={markDirty}>
          {categoryPage ? (
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setCategoryPage(false)}
                className="mb-1 flex items-center gap-1 text-[12px] font-semibold text-primary"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Voltar
              </button>
              {filteredCategories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { markDirty(); setCategoryId(c.id); setCategoryPage(false); }}
                  className={`w-full rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${
                    categoryId === c.id ? "bg-primary-tint text-primary" : "text-text-primary hover:bg-fill-light"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : (
            <>
              <fieldset>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Categoria</label>
                {filteredCategories.length === 0 ? (
                  <div className="rounded-[12px] bg-fill-light px-3 py-3 text-center text-[12px] text-text-muted">
                    {budgetType === "expense" ? "Crie primeiro uma categoria de despesa." : "Crie primeiro uma categoria de receita."}
                  </div>
                ) : (
                  <button
                    data-testid="category-selector-trigger"
                    onClick={() => setCategoryPage(true)}
                    className="flex w-full items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5 text-left text-[13px] font-semibold text-text-primary"
                  >
                    {categoryId
                      ? categories.find((c) => c.id === categoryId)?.name ?? "Categoria"
                      : "Selecionar categoria"}
                    <svg className="ml-auto" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                )}
              </fieldset>

              <fieldset>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  {budgetType === "expense" ? "Limite mensal" : "Previsão mensal"}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[16px] font-semibold text-text-secondary">R$</span>
                  <input type="text" inputMode="numeric" value={amount}
                    onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); if (raw.length > 12) return; setAmount(formatInputBRL(raw)); }}
                    placeholder="0,00"
                    className="w-full rounded-[13px] border border-border bg-transparent py-3 pl-11 pr-3.5 font-mono text-[16px] font-semibold text-text-primary outline-none focus:border-primary" />
                </div>
              </fieldset>

              <button type="button" onClick={handleSave}
                disabled={!categoryId || parseBRLToCents(amount) <= 0}
                className="mt-2 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                Salvar orçamento
              </button>
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function BudgetDetailSheet({
  budget,
  spent,
  open,
  onClose,
  onSave,
}: {
  budget: { id: string; name: string; amountCents: number; categoryId: string } | null;
  spent: number;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, input: { amountCents?: number; alertThreshold?: number }) => void | Promise<void>;
}) {
  const { markDirty, markClean } = useFormDirtySafe();
  const [editMode, setEditMode] = useState(false);
  const [amountDisplay, setAmountDisplay] = useState("");

  useEffect(() => {
    if (budget && open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmountDisplay(formatInputBRL(String(budget.amountCents)));
      setEditMode(false);
      markClean();
    }
  // `markClean` changes identity whenever context state changes. Depending on it
  // here re-enters the effect and resets editMode immediately after Edit is clicked.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budget, open]);

  if (!budget) return null;

  const pct = budget.amountCents > 0 ? Math.min((spent / budget.amountCents) * 100, 100) : 0;
  const barColor = pct >= 100 ? "var(--color-danger)" : pct >= 80 ? "var(--color-warning)" : "var(--color-primary)";

  function handleClose() {
    markClean();
    onClose();
  }

  async function handleSave() {
    if (!budget) return;
    const amountCents = parseBRLToCents(amountDisplay);
    if (amountCents <= 0) return;
    try {
      await onSave(budget.id, { amountCents });
      markClean();
      onClose();
    } catch {
      // Save failed: keep dirty.
    }
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={editMode ? "Editar orçamento" : "Detalhes do orçamento"}>
      {editMode ? (
        <div className="flex flex-col gap-4" onChangeCapture={markDirty}>
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Limite mensal</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[16px] font-semibold text-text-secondary">R$</span>
              <input type="text" inputMode="numeric" value={amountDisplay}
                onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); if (raw.length > 12) return; setAmountDisplay(formatInputBRL(raw)); }}
                placeholder="0,00"
                className="w-full rounded-[13px] border border-border bg-transparent py-3 pl-11 pr-3.5 font-mono text-[16px] font-semibold text-text-primary outline-none focus:border-primary" />
            </div>
          </fieldset>
          <button type="button" onClick={handleSave}
            disabled={parseBRLToCents(amountDisplay) <= 0}
            className="mt-2 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            Salvar alterações
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="text-[14px] font-semibold text-text-primary">{budget.name}</div>
          <div className="h-2 rounded-full bg-fill-medium">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
          </div>
          <div className="flex justify-between text-[13px] text-text-muted">
            <span>Gasto: <b className="font-mono text-text-primary">{formatBRL(spent)}</b></span>
            <span>Limite: <b className="font-mono text-text-primary">{formatBRL(budget.amountCents)}</b></span>
          </div>
          <div className="text-center text-[20px] font-bold" style={{ color: barColor }}>{formatPct(pct)}</div>
          <button type="button" onClick={() => setEditMode(true)}
            className="w-full rounded-[14px] bg-fill-light py-[14px] text-center text-[14px] font-bold text-text-primary">
            Editar
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

export default function BudgetsPage() {
  const { budgets, categories, transactions, loading, error, writeError, clearWriteError, createBudget, updateBudget } = useAppState();
  const [tab, setTab] = useState<"expense" | "income">("expense");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailBudget, setDetailBudget] = useState<{ id: string; name: string; amountCents: number; categoryId: string } | null>(null);

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

  // Current period for filtering transactions
  const currentPeriod = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  // Real spending from period-filtered transactions (avoids stale/zero spentCents)
  const realSpentByBudget = useMemo(() => {
    const expenseMap = new Map<string, number>();
    const incomeMap = new Map<string, number>();
    const childrenOf = new Map<string, string[]>();

    for (const cat of categories) {
      if (cat.parentId) {
        const kids = childrenOf.get(cat.parentId) ?? [];
        kids.push(cat.id);
        childrenOf.set(cat.parentId, kids);
      }
    }

    for (const t of transactions) {
      if (!t.date.startsWith(currentPeriod)) continue;
      if (t.kind === "expense") {
        expenseMap.set(t.categoryId, (expenseMap.get(t.categoryId) ?? 0) + t.amountCents);
      } else if (t.kind === "income") {
        incomeMap.set(t.categoryId, (incomeMap.get(t.categoryId) ?? 0) + t.amountCents);
      }
    }

    const result = new Map<string, number>();
    for (const b of budgets) {
      const cat = categories.find((c) => c.id === b.categoryId);
      const isIncome = cat?.kind === "income";
      const map = isIncome ? incomeMap : expenseMap;
      const relevantIds = [b.categoryId];
      const subs = childrenOf.get(b.categoryId);
      if (subs) relevantIds.push(...subs);
      result.set(b.id, relevantIds.reduce((s, id) => s + (map.get(id) ?? 0), 0));
    }

    return result;
  }, [transactions, categories, budgets, currentPeriod]);

  const totalSpent = visibleBudgets.reduce(
    (s, b) => s + (realSpentByBudget.get(b.id) ?? 0),
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

        <StaleBanner domains={["budgets", "categories"]} />

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
              const realSpent = realSpentByBudget.get(b.id) ?? 0;
              const pct =
                b.amountCents > 0
                  ? Math.min((realSpent / b.amountCents) * 100, 100)
                  : 0;
              const color = barColor(pct);
              const icon = getCategoryIcon(b.categoryId);

              return (
                <button
                  type="button"
                  key={b.id}
                  onClick={() => setDetailBudget({ id: b.id, name: b.name, amountCents: b.amountCents, categoryId: b.categoryId })}
                  className="relative w-full rounded-[16px] border border-border bg-surface px-4 py-4 pr-11 shadow-card text-left transition-colors hover:bg-fill-light"
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
                      {formatBRL(realSpent)}{" "}
                      {tab === "expense" ? "gasto" : "recebido"}
                    </span>
                    <span>
                      de {formatBRL(b.amountCents)}{" "}
                      {tab === "income" ? "previsto" : ""}
                    </span>
                  </div>
                  {/* chevron */}
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </main>

      <BudgetDetailSheet
        budget={detailBudget}
        spent={detailBudget ? realSpentByBudget.get(detailBudget.id) ?? 0 : 0}
        open={detailBudget !== null}
        onClose={() => setDetailBudget(null)}
        onSave={(id, input) => updateBudget(id, input)}
      />

      <NewBudgetSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={createBudget}
        categories={categories}
      />
    </div>
  );
}
