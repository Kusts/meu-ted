"use client";

import { useMemo, useState } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import { useAppState } from "@/lib/state/app-state-context";
import AdoptionMetrics from "./AdoptionMetrics";

type Period = "month" | "last" | "quarter" | "year";

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatBRLShort(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1000) {
    return `R$ ${(v / 1000).toFixed(1)}k`;
  }
  return formatBRL(cents);
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

interface CategoryRow {
  id: string;
  name: string;
  amountCents: number;
  pct: number;
  color: string;
  tint: string;
}

const CATEGORY_PALETTE = [
  { color: "#0E8C5A", tint: "#E7F3EC" },
  { color: "#C8483B", tint: "#F7E9E7" },
  { color: "#B8791F", tint: "#FBF1E3" },
  { color: "#3E6FB0", tint: "#E8EFF7" },
  { color: "#2FA56F", tint: "#E7F3EC" },
  { color: "#820AD1", tint: "#EEE9F7" },
  { color: "#EC7000", tint: "#FBF1E3" },
];

export default function ReportsPage() {
  const {
    accounts,
    transactions,
    categories,
    goals,
    debts,
    budgets,
    loading,
    error,
  } = useAppState();
  const [period, setPeriod] = useState<Period>("month");

  const periodMsgs: Record<Period, string> = {
    month: "Mês",
    last: "Mês passado",
    quarter: "Trim.",
    year: "Ano",
  };

  // ── Período em ms ──
  const periodMs = useMemo(() => {
    const now = new Date();
    if (period === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: start, to: now };
    }
    if (period === "last") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: start, to: end };
    }
    if (period === "quarter") {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      // Cover the FULL current quarter (mirrors "Mês passado" semantics, which
      // returns the full previous month rather than "up to today"). Truncating
      // to `now` would silently shrink the window on the first days of a
      // quarter — e.g. on Jul 2, the buggy code shows only 2 days, masking
      // the user's actual quarterly activity.
      const end = new Date(now.getFullYear(), q * 3 + 3, 0);
      return { from: start, to: end };
    }
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: start, to: now };
  }, [period]);

  // ── Period subtitle (human-readable range) ──
  const periodSubtitle = useMemo(() => {
    if (period === "month") {
      return periodMs.from.toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      });
    }
    if (period === "last") {
      return periodMs.from.toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      });
    }
    if (period === "quarter") {
      const q = Math.floor(new Date().getMonth() / 3);
      const ordinals = ["1º", "2º", "3º", "4º"];
      return `${ordinals[q]} trimestre de ${new Date().getFullYear()}`;
    }
    return String(new Date().getFullYear());
  }, [period, periodMs]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.date + "T12:00:00");
      return d >= periodMs.from && d <= periodMs.to;
    });
  }, [transactions, periodMs]);

  const incomeCents = filtered
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + t.amountCents, 0);
  const expenseCents = filtered
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.amountCents, 0);
  const netCents = incomeCents - expenseCents;
  const savingsRate = incomeCents > 0 ? (netCents / incomeCents) * 100 : 0;
  const avgTicket = filtered.length > 0 ? expenseCents / filtered.length : 0;

  // ── Fluxo 6 meses (sempre mostra últimos 6 meses correntes) ──
  const monthlyFlow = useMemo(() => {
    const now = new Date();
    const months: {
      key: string;
      label: string;
      income: number;
      expense: number;
    }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d
        .toLocaleDateString("pt-BR", { month: "short" })
        .replace(".", "")
        .slice(0, 3);
      months.push({ key, label, income: 0, expense: 0 });
    }
    const map = new Map(months.map((m) => [m.key, m]));
    for (const t of transactions) {
      const k = t.date.slice(0, 7);
      const m = map.get(k);
      if (!m) continue;
      if (t.kind === "income") m.income += t.amountCents;
      else if (t.kind === "expense") m.expense += t.amountCents;
    }
    return months;
  }, [transactions]);

  const maxFlow = useMemo(() => {
    let max = 0;
    for (const m of monthlyFlow) {
      max = Math.max(max, m.income, m.expense);
    }
    return max || 1;
  }, [monthlyFlow]);

  // ── Distribuição por categoria (donut) ──
  const donutCategories: CategoryRow[] = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filtered) {
      if (t.kind !== "expense") continue;
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amountCents);
    }
    const total = expenseCents || 1;
    const rows = Array.from(map.entries())
      .map(([id, amt]) => {
        const cat = categories.find((c) => c.id === id);
        return {
          id,
          name: cat?.name ?? "Outros",
          amountCents: amt,
          pct: (amt / total) * 100,
          color: CATEGORY_PALETTE[0].color,
          tint: CATEGORY_PALETTE[0].tint,
        };
      })
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 6);
    return rows.map((r, i) => ({
      ...r,
      color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length].color,
      tint: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length].tint,
    }));
  }, [filtered, expenseCents, categories]);

  // ── Top categorias ──
  const topCategories = useMemo(() => {
    return [...donutCategories].slice(0, 5);
  }, [donutCategories]);

  // ── Budget real spending (period-filtered) ──
  // Builds a map: categoryId → total spent from filtered transactions.
  // Includes subcategories: if a transaction's category has a parentId
  // that matches the budget's categoryId, it contributes to that budget.
  const budgetRealSpent = useMemo(() => {
    const map = new Map<string, number>();
    // Build parent→children index
    const childrenOf = new Map<string, string[]>();
    for (const cat of categories) {
      if (cat.parentId) {
        const kids = childrenOf.get(cat.parentId) ?? [];
        kids.push(cat.id);
        childrenOf.set(cat.parentId, kids);
      }
    }
    for (const t of filtered) {
      if (t.kind !== "expense") continue;
      // Add to the transaction's own category
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amountCents);
    }
    return { map, childrenOf };
  }, [filtered, categories]);

  // ── Patrimônio ──
  const checkingAccounts = accounts.filter((a) => a.kind !== "credit_card");
  const creditCards = accounts.filter((a) => a.kind === "credit_card");
  const cardSpending = creditCards.map((card) => {
    const spent = transactions
      .filter((t) => t.accountId === card.id && t.kind === "expense")
      .reduce((s, t) => s + t.amountCents, 0);
    return spent;
  });
  const totalCardSpent = cardSpending.reduce((s, x) => s + x, 0);
  const totalGoalsCurrent = goals.reduce((s, g) => s + g.currentAmountCents, 0);
  const totalDebtRemaining = debts.reduce(
    (s, d) => s + (d.totalAmountCents - d.paidAmountCents),
    0,
  );
  const netWorth =
    checkingAccounts.reduce((s, a) => s + a.balanceCents, 0) +
    totalGoalsCurrent -
    totalCardSpent -
    totalDebtRemaining;

  // Conic gradient for donut (CSS)
  const donutBg = useMemo(() => {
    if (donutCategories.length === 0) return "#F1F3EF";
    let cumulative = 0;
    const parts: string[] = [];
    for (const c of donutCategories) {
      const start = cumulative;
      const end = cumulative + (c.pct / 100) * 360;
      parts.push(`${c.color} ${start}deg ${end}deg`);
      cumulative = end;
    }
    parts.push(`#F1F3EF ${cumulative}deg 360deg`);
    return `conic-gradient(${parts.join(", ")})`;
  }, [donutCategories]);

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <StatusBar />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-fill-medium border-t-primary" />
            <span className="text-[13px] font-semibold text-text-muted">
              Carregando...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />
      <main className="flex flex-1 flex-col pb-[var(--tab-bar-height)]">
        <PageHeader title="Relatórios" />
        <AdoptionMetrics />

        {error && (
          <div className="mx-5 mb-3 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger">
            ⚠ {error}
          </div>
        )}

        {/* Period tabs */}
        <div className="px-5 pb-1 pt-1">
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-fill-medium p-1">
            {(["month", "last", "quarter", "year"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-[10px] py-2 text-center text-[12px] font-bold transition-colors ${
                  period === p
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-muted"
                }`}
              >
                {periodMsgs[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Period subtitle */}
        <div className="px-5 pb-2">
          <span className="text-[13px] font-semibold text-text-secondary capitalize">
            {periodSubtitle}
          </span>
        </div>

        <div className="flex flex-col gap-3.5 px-5 pt-3">
          {/* Hero Resultado do período */}
          <div
            className="rounded-[18px] p-5 text-white"
            style={{ background: "linear-gradient(150deg, #0F6B45, #0A3A28)" }}
          >
            <div className="mb-[2px] text-[11px] uppercase tracking-wider text-white/65">
              Resultado do período
            </div>
            <div
              className="mb-4 font-mono text-[34px] font-semibold leading-none"
              style={{ letterSpacing: "-1px" }}
            >
              {formatBRL(netCents)}
            </div>
            <div className="grid grid-cols-[1fr_1px_1fr_1px_1fr] items-center gap-2.5">
              <div>
                <div className="mb-[2px] text-[10px] text-white/65">
                  Receitas
                </div>
                <div className="font-mono text-[15px] font-semibold text-[#7FE3B0]">
                  {formatBRL(incomeCents)}
                </div>
              </div>
              <div className="h-[30px] w-px bg-white/20" />
              <div>
                <div className="mb-[2px] text-[10px] text-white/65">
                  Despesas
                </div>
                <div className="font-mono text-[15px] font-semibold text-[#F9A8A2]">
                  {formatBRL(expenseCents)}
                </div>
              </div>
              <div className="h-[30px] w-px bg-white/20" />
              <div>
                <div className="mb-[2px] text-[10px] text-white/65">
                  Poupado
                </div>
                <div className="font-mono text-[15px] font-semibold">
                  {formatPct(savingsRate)}
                </div>
              </div>
            </div>
            <div className="mt-3.5 h-[6px] rounded-full bg-white/20">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, savingsRate))}%`,
                  background: "linear-gradient(90deg, #7FE3B0, #0E8C5A)",
                }}
              />
            </div>
          </div>

          {/* KPI grid: ticket médio / taxa poupança */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-[14px] border border-border bg-surface px-3.5 py-3.5">
              <div className="mb-1 text-[10px] font-bold uppercase text-text-muted">
                Ticket médio
              </div>
              <div className="font-mono text-[20px] font-semibold text-text-primary">
                {formatBRLShort(Math.round(avgTicket))}
              </div>
              <div className="mt-1 text-[10px] text-text-muted">
                por lançamento
              </div>
            </div>
            <div className="rounded-[14px] border border-border bg-surface px-3.5 py-3.5">
              <div className="mb-1 text-[10px] font-bold uppercase text-text-muted">
                Taxa de poupança
              </div>
              <div className="font-mono text-[20px] font-semibold text-primary">
                {formatPct(savingsRate)}
              </div>
              <div className="mt-1 text-[10px] text-text-muted">meta: 20%</div>
            </div>
          </div>

          {/* Fluxo mensal */}
          <div className="rounded-[16px] border border-border bg-surface px-4 py-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[13px] font-bold text-text-primary">
                Fluxo mensal
              </span>
              <div className="flex gap-3">
                <span className="flex items-center gap-1 text-[10px] text-text-muted">
                  <span className="h-2 w-2 rounded-sm bg-primary" />
                  Receitas
                </span>
                <span className="flex items-center gap-1 text-[10px] text-text-muted">
                  <span className="h-2 w-2 rounded-sm bg-[#F9A8A2]" />
                  Despesas
                </span>
              </div>
            </div>
            <div className="flex h-[100px] items-end justify-between gap-1.5">
              {monthlyFlow.map((m) => (
                <div
                  key={m.key}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <div className="flex h-[88px] w-full items-end gap-[2px]">
                    <div
                      className="flex-1 rounded-t-sm"
                      style={{
                        background: "#0E8C5A",
                        height: `${(m.income / maxFlow) * 100}%`,
                      }}
                    />
                    <div
                      className="flex-1 rounded-t-sm"
                      style={{
                        background: "#F9A8A2",
                        height: `${(m.expense / maxFlow) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] font-medium text-text-muted">
                    {m.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Distribuição de gastos (donut) */}
          <div className="rounded-[16px] border border-border bg-surface px-4 py-4">
            <div className="mb-3.5 text-[13px] font-bold text-text-primary">
              Distribuição de gastos
            </div>
            {donutCategories.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-text-muted">
                Sem despesas no período.
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div
                  className="relative h-[90px] w-[90px] flex-none rounded-full"
                  style={{ background: donutBg }}
                >
                  <div className="absolute inset-[20px] flex items-center justify-center rounded-full bg-surface">
                    <span className="font-mono text-[11px] font-bold text-text-primary">
                      {formatBRL(expenseCents)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  {donutCategories.slice(0, 4).map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 text-[11px]"
                    >
                      <span
                        className="h-2 w-2 flex-none rounded-sm"
                        style={{ background: c.color }}
                      />
                      <span className="flex-1 text-text-secondary">
                        {c.name}
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-text-primary">
                        {formatBRL(c.amountCents)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Top categorias */}
          <div className="rounded-[16px] border border-border bg-surface px-4 py-4">
            <div className="mb-3.5 text-[13px] font-bold text-text-primary">
              Top categorias
            </div>
            <div className="flex flex-col gap-3.5">
              {topCategories.length === 0 ? (
                <div className="py-2 text-center text-[12px] text-text-muted">
                  Sem dados.
                </div>
              ) : (
                topCategories.map((c) => (
                  <div key={c.id}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-lg"
                          style={{ background: c.tint }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: c.color }}
                          />
                        </div>
                        <span className="text-[13px] font-semibold text-text-primary">
                          {c.name}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[13px] font-semibold text-text-primary">
                          {formatBRL(c.amountCents)}
                        </div>
                        <div className="text-[10px] text-text-muted">
                          {formatPct(c.pct)}
                        </div>
                      </div>
                    </div>
                    <div className="h-[6px] rounded-full bg-fill-medium">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${c.pct}%`, background: c.color }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Evolução patrimonial */}
          <div className="rounded-[16px] border border-border bg-surface px-4 py-4">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <div className="text-[13px] font-bold text-text-primary">
                  Evolução patrimonial
                </div>
                <div className="mt-0.5 text-[11px] text-text-muted">
                  últimos 6 meses
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[15px] font-semibold text-primary">
                  {formatBRL(netWorth)}
                </div>
                <div className="text-[10px] text-primary">↑ vs jan</div>
              </div>
            </div>
            <svg
              width="100%"
              height="96"
              viewBox="0 0 300 96"
              preserveAspectRatio="none"
              style={{ display: "block", margin: "8px 0 4px" }}
            >
              <defs>
                <linearGradient id="patG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0E8C5A" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#0E8C5A" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,72 C20,68 40,64 70,58 C100,52 120,46 150,38 C180,30 210,22 240,16 C265,11 285,8 300,6 L300,96 L0,96 Z"
                fill="url(#patG)"
              />
              <path
                d="M0,72 C20,68 40,64 70,58 C100,52 120,46 150,38 C180,30 210,22 240,16 C265,11 285,8 300,6"
                fill="none"
                stroke="#0E8C5A"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx="0" cy="72" r="3.5" fill="#0E8C5A" />
              <circle cx="60" cy="58" r="3.5" fill="#0E8C5A" />
              <circle cx="120" cy="46" r="3.5" fill="#0E8C5A" />
              <circle cx="180" cy="32" r="3.5" fill="#0E8C5A" />
              <circle cx="240" cy="16" r="3.5" fill="#0E8C5A" />
              <circle
                cx="300"
                cy="6"
                r="4.5"
                fill="#fff"
                stroke="#0E8C5A"
                strokeWidth="2.5"
              />
            </svg>
            <div className="flex justify-between text-[10px] text-text-muted">
              <span>Jan</span>
              <span>Fev</span>
              <span>Mar</span>
              <span>Abr</span>
              <span>Mai</span>
              <span>Jun</span>
            </div>
          </div>

          {/* Orçamentos vs Real */}
          {budgets.length > 0 && (
            <div className="mt-3.5 rounded-[16px] border border-border bg-surface px-4 py-4">
              <div className="mb-3.5 text-[13px] font-bold text-text-primary">
                Orçamentos vs Real
              </div>
              <div className="flex flex-col gap-3.5">
                {budgets.slice(0, 5).map((b) => {
                  // Compute real spent from period-filtered transactions,
                  // including subcategories of the budget's category.
                  const relevantIds = [b.categoryId];
                  const subs = budgetRealSpent.childrenOf.get(b.categoryId);
                  if (subs) relevantIds.push(...subs);
                  const realSpent = relevantIds.reduce(
                    (s, id) => s + (budgetRealSpent.map.get(id) ?? 0),
                    0,
                  );
                  const pct =
                    b.amountCents > 0
                      ? Math.min((realSpent / b.amountCents) * 100, 100)
                      : 0;
                  const barColor =
                    pct >= 100
                      ? "var(--color-danger)"
                      : pct >= 80
                        ? "var(--color-warning)"
                        : "var(--color-primary)";
                  return (
                    <div key={b.id}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-text-primary">
                          {b.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-text-muted">
                            {formatBRL(realSpent)} / {formatBRL(b.amountCents)}
                          </span>
                          <span
                            className="font-mono text-[11px] font-bold"
                            style={{ color: barColor }}
                          >
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="h-[7px] rounded-[4px] bg-fill-medium">
                        <div
                          className="h-full rounded-[4px] transition-all"
                          style={{ width: `${pct}%`, background: barColor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
