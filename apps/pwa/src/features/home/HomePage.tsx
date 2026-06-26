"use client";

import StatusBar from "@/components/StatusBar";
import Link from "next/link";
import { StaleBanner } from "@/components/StaleBanner";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import { useAppState } from "@/lib/state/app-state-context";

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

interface InsightItem {
  color: string;
  title: string;
  body: string;
}

function LoadingScreen() {
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

const CATEGORY_PALETTE = [
  { color: "#0E8C5A", tint: "#E7F3EC" },
  { color: "#C8483B", tint: "#F7E9E7" },
  { color: "#B8791F", tint: "#FBF1E3" },
  { color: "#3E6FB0", tint: "#E8EFF7" },
  { color: "#2FA56F", tint: "#E7F3EC" },
  { color: "#820AD1", tint: "#EEE9F7" },
  { color: "#EC7000", tint: "#FBF1E3" },
];

interface HomePageProps {
  onNewTransaction?: (kind: "expense" | "income" | "transfer") => void;
}

export default function HomePage({ onNewTransaction }: HomePageProps = {}) {
  const { accounts, transactions, categories, payables, budgets, loading, error } =
    useAppState();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSub, setProfileSub] = useState<"" | "edit" | "security" | "chat">("");

  const handleNew = (kind: "expense" | "income" | "transfer") => {
    if (onNewTransaction) onNewTransaction(kind);
    else if (typeof window !== "undefined") {
      // fallback: dispatch custom event
      window.dispatchEvent(
        new CustomEvent("pwa:open-tx", { detail: { kind } }),
      );
    }
  };

  const incomeDeltaPct = useMemo(() => {
    const now = new Date();
    const currMonth = now.getMonth();
    const currYear = now.getFullYear();
    const prevMonth = currMonth === 0 ? 11 : currMonth - 1;
    const prevYear = currMonth === 0 ? currYear - 1 : currYear;
    let prev = 0;
    let curr = 0;
    for (const t of transactions) {
      if (t.kind !== "income") continue;
      const d = new Date(t.date + "T12:00:00");
      const m = d.getMonth();
      const y = d.getFullYear();
      if (m === currMonth && y === currYear) curr += t.amountCents;
      else if (m === prevMonth && y === prevYear) prev += t.amountCents;
    }
    if (prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  }, [transactions]);

  const expenseDeltaPct = useMemo(() => {
    const now = new Date();
    const currMonth = now.getMonth();
    const currYear = now.getFullYear();
    const prevMonth = currMonth === 0 ? 11 : currMonth - 1;
    const prevYear = currMonth === 0 ? currYear - 1 : currYear;
    let prev = 0;
    let curr = 0;
    for (const t of transactions) {
      if (t.kind !== "expense") continue;
      const d = new Date(t.date + "T12:00:00");
      const m = d.getMonth();
      const y = d.getFullYear();
      if (m === currMonth && y === currYear) curr += t.amountCents;
      else if (m === prevMonth && y === prevYear) prev += t.amountCents;
    }
    if (prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  }, [transactions]);

  // ── Donut: gastos por categoria (top 4) ──
  const totalExpensesForDonut = transactions
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.amountCents, 0);

  const donutData = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.kind !== "expense") continue;
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amountCents);
    }
    const total = totalExpensesForDonut || 1;
    const rows = Array.from(map.entries())
      .map(([id, amt]) => {
        const cat = categories.find((c) => c.id === id);
        return {
          id,
          name: cat?.name ?? "Outros",
          amountCents: amt,
          pct: (amt / total) * 100,
        };
      })
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 4)
      .map((r, i) => ({
        ...r,
        color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length].color,
      }));
    return rows;
  }, [transactions, categories, totalExpensesForDonut]);

  const donutBg = useMemo(() => {
    if (donutData.length === 0) return "#F1F3EF";
    let cumulative = 0;
    const parts: string[] = [];
    for (const c of donutData) {
      const start = cumulative;
      const end = cumulative + (c.pct / 100) * 360;
      parts.push(`${c.color} ${start}deg ${end}deg`);
      cumulative = end;
    }
    parts.push(`#F1F3EF ${cumulative}deg 360deg`);
    return `conic-gradient(${parts.join(", ")})`;
  }, [donutData]);

  if (loading) {
    return <LoadingScreen />;
  }

  const checkingAccounts = accounts.filter((a) => a.kind !== "credit_card");
  const creditCards = accounts.filter((a) => a.kind === "credit_card");

  const totalBalance = checkingAccounts.reduce(
    (sum, a) => sum + a.balanceCents,
    0,
  );

  const totalIncome = transactions
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + t.amountCents, 0);

  const totalExpenses = transactions
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.amountCents, 0);

  const netResult = totalIncome - totalExpenses;

  // ── Donut: gastos por categoria (top 4) ──
  // (hooked above before early return)

  // ── Card spending from credit card accounts ──
  const cardSpending = creditCards.map((card) => {
    const spent = transactions
      .filter((t) => t.accountId === card.id && t.kind === "expense")
      .reduce((s, t) => s + t.amountCents, 0);
    const limit = card.creditLimitCents ?? 1;
    const pct = Math.min((spent / limit) * 100, 100);
    const barColor =
      pct > 90
        ? "var(--color-danger)"
        : pct > 70
          ? "var(--color-warning)"
          : "var(--color-primary)";
    return { card, spent, limit, pct, barColor };
  });

  const totalCardSpent = cardSpending.reduce((s, c) => s + c.spent, 0);
  const totalCardLimit = cardSpending.reduce((s, c) => s + c.limit, 0);
  const totalCardAvail = totalCardLimit - totalCardSpent;

  // ── Payables summary ──
  const pendingPayables = payables.filter((p) => p.status === "pending" || p.status === "overdue");
  const totalPendingPayables = pendingPayables.reduce((s, p) => s + p.amountCents, 0);

  // ── Insights ──
  const insights: InsightItem[] = [];

  // 1. Savings rate
  if (totalIncome > 0) {
    const savingsRate = ((totalIncome - totalExpenses) / totalIncome) * 100;
    const isGood = savingsRate >= 20;
    const isWarn = savingsRate >= 5;
    insights.push({
      color: isGood
        ? "var(--color-primary)"
        : isWarn
          ? "var(--color-warning)"
          : "var(--color-danger)",
      title: "Taxa de poupança",
      body: `Você poupa ${formatPct(savingsRate)} da sua renda.${
        isGood ? " Excelente!" : isWarn ? " Pode melhorar." : " Atenção!"
      }`,
    });
  }

  // 2. Top expense category (excluding card accounts)
  const expenseByCategory: Record<string, number> = {};
  transactions
    .filter((t) => t.kind === "expense")
    .forEach((t) => {
      expenseByCategory[t.categoryId] =
        (expenseByCategory[t.categoryId] || 0) + t.amountCents;
    });
  const topCatId = Object.keys(expenseByCategory).sort(
    (a, b) => (expenseByCategory[b] ?? 0) - (expenseByCategory[a] ?? 0),
  )[0];
  if (topCatId) {
    const topCat = categories.find((c) => c.id === topCatId);
    const topAmount = expenseByCategory[topCatId] ?? 0;
    insights.push({
      color: "var(--color-info)",
      title: "Maior categoria de gasto",
      body: `${topCat?.name ?? "Outros"} — ${formatBRL(topAmount)} no período.`,
    });
  }

  // 3. Budgets near limit
  const nearLimit = budgets.filter(
    (b) => b.amountCents > 0 && (b.spentCents / b.amountCents) >= 0.9,
  );
  if (nearLimit.length > 0) {
    insights.push({
      color: "var(--color-warning)",
      title: "Orçamentos no limite",
      body: `${nearLimit.map((b) => b.name).join(", ")} ${
        nearLimit.length === 1 ? "está" : "estão"
      } perto do limite (${formatPct(90)}+).`,
    });
  } else if (budgets.length > 0) {
    const maxUsage = Math.max(
      ...budgets.map((b) =>
        b.amountCents > 0 ? (b.spentCents / b.amountCents) * 100 : 0,
      ),
    );
    const highestBudget = budgets.find(
      (b) =>
        b.amountCents > 0 &&
        (b.spentCents / b.amountCents) * 100 === maxUsage,
    );
    insights.push({
      color: "var(--color-primary)",
      title: "Orçamentos sob controle",
      body: highestBudget
        ? `O mais utilizado é ${highestBudget.name} (${formatPct(maxUsage)}).`
        : "Todos dentro do planejado.",
    });
  }

  // 4. Next payable due
  const upcomingPayables = payables
    .filter((p) => p.status === "pending")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (upcomingPayables.length > 0) {
    const next = upcomingPayables[0];
    const dueDate = new Date(next.dueDate);
    const today = new Date();
    const daysUntil = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    insights.push({
      color:
        daysUntil <= 1
          ? "var(--color-danger)"
          : daysUntil <= 7
            ? "var(--color-warning)"
            : "var(--color-info)",
      title: "Próxima conta a vencer",
      body: `${next.description} — ${formatBRL(next.amountCents)} em ${
        daysUntil <= 0
          ? "vencida!"
          : daysUntil === 1
            ? "amanhã"
            : `${daysUntil} dias`
      } (${next.dueDate}).`,
    });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />

      <StaleBanner domains={["accounts", "transactions", "payables", "budgets"]} />

      {error && (
        <div className="mx-5 mt-2 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger">
          ⚠ {error}
        </div>
      )}

      <main
        className="flex flex-1 flex-col overflow-y-auto pb-[var(--tab-bar-height)]"
      >
        {/* ── Hero area (green gradient) ── */}
        <div
          className="px-5 pt-1"
          style={{
            background: "linear-gradient(165deg, #0F6B45, #0A3A28)",
            paddingBottom: 24,
          }}
        >
          {/* Header: avatar + greeting + bell */}
          <div className="mb-5 mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full font-mono text-[15px] font-semibold text-white"
                style={{ background: "rgba(255,255,255,.18)" }}
              >
                M
              </button>
              <div>
                <div className="text-xs text-white/70">
                  {(() => {
                    const h = new Date().getHours();
                    if (h < 6) return "Boa madrugada";
                    if (h < 12) return "Bom dia";
                    if (h < 18) return "Boa tarde";
                    return "Boa noite";
                  })()}
                </div>
                <div className="text-[15px] font-bold text-white">Marina</div>
              </div>
            </div>
            <div className="relative flex h-[38px] w-[38px] items-center justify-center rounded-full text-white"
              style={{ background: "rgba(255,255,255,.14)" }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              <div className="absolute right-[9px] top-[8px] h-[7px] w-[7px] rounded-full border-[1.5px]"
                style={{ background: "#E0A33E", borderColor: "#0C4430" }}
              />
            </div>
          </div>

          {/* Saldo */}
          <div className="mb-[5px] text-xs text-white/70">Saldo total · contas</div>
          <div
            className="mb-[18px] font-mono text-[40px] font-semibold text-white"
            style={{ letterSpacing: "-0.02em", lineHeight: 1 }}
          >
            {formatBRL(totalBalance)}
          </div>

          {/* Mini-stats row */}
          <div className="flex gap-[9px]">
            <div className="flex-1 rounded-[13px] p-[10px_12px]"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              <div className="mb-[3px] text-[11px] text-white/70">Receitas</div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-semibold text-white">
                {formatBRL(totalIncome)}
              </div>
            </div>
            <div className="flex-1 rounded-[13px] p-[10px_12px]"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              <div className="mb-[3px] text-[11px] text-white/70">Despesas</div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-semibold text-white">
                {formatBRL(totalExpenses)}
              </div>
            </div>
            <div className="flex-1 rounded-[13px] p-[10px_12px]"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              <div className="mb-[3px] text-[11px] text-white/70">Resultado</div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-semibold"
                style={{ color: netResult >= 0 ? "#7FE3B0" : "#F9A8A2" }}
              >
                {formatBRL(netResult)}
              </div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="px-5 pb-1 pt-2">
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => handleNew("expense")}
              className="flex flex-col items-center gap-1.5 rounded-[14px] border border-border bg-surface py-3"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#C8483B"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12h8" />
              </svg>
              <span className="text-[11px] font-semibold text-text-secondary">
                Despesa
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleNew("income")}
              className="flex flex-col items-center gap-1.5 rounded-[14px] border border-border bg-surface py-3"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#0E8C5A"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12h8M12 8v8" />
              </svg>
              <span className="text-[11px] font-semibold text-text-secondary">
                Receita
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleNew("transfer")}
              className="flex flex-col items-center gap-1.5 rounded-[14px] border border-border bg-surface py-3"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#3E6FB0"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" />
              </svg>
              <span className="text-[11px] font-semibold text-text-secondary">
                Transferir
              </span>
            </button>
          </div>
        </div>

        {/* ── Content area ── */}
        <div className="px-5 pb-6 pt-4">
          {/* KPI delta row */}
          <div className="mb-[14px] grid grid-cols-2 gap-2.5">
            <div className="rounded-[14px] border border-border bg-surface p-3 shadow-card">
              <div className="mb-[6px] text-[11px] text-text-muted">
                Receitas vs mês ant.
              </div>
              <div className="flex items-center gap-1.5 text-primary">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 6 13.5 15.5 8.5 10.5 1 18" />
                  <path d="M17 6h6v6" />
                </svg>
                <span className="font-mono text-[17px] font-semibold">
                  {incomeDeltaPct === null ? "—" : `${incomeDeltaPct >= 0 ? "+" : ""}${incomeDeltaPct.toFixed(0)}%`}
                </span>
              </div>
            </div>
            <div className="rounded-[14px] border border-border bg-surface p-3 shadow-card">
              <div className="mb-[6px] text-[11px] text-text-muted">
                Despesas vs mês ant.
              </div>
              <div
                className="flex items-center gap-1.5"
                style={{
                  color:
                    expenseDeltaPct === null
                      ? "var(--color-text-muted)"
                      : expenseDeltaPct <= 0
                        ? "var(--color-primary)"
                        : "var(--color-danger)",
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform:
                      expenseDeltaPct !== null && expenseDeltaPct > 0
                        ? "scaleY(-1)"
                        : "none",
                  }}
                >
                  <path d="M23 6 13.5 15.5 8.5 10.5 1 18" />
                  <path d="M17 6h6v6" />
                </svg>
                <span className="font-mono text-[17px] font-semibold">
                  {expenseDeltaPct === null
                    ? "—"
                    : `${expenseDeltaPct >= 0 ? "+" : ""}${expenseDeltaPct.toFixed(0)}%`}
                </span>
              </div>
            </div>
          </div>

          {/* Account list card */}
          <div className="mb-[14px] overflow-hidden rounded-[16px] border border-border bg-surface px-4 py-[6px] shadow-card">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm font-bold text-text-primary">Minhas contas</span>
              <Link
                href="/contas"
                className="text-[11px] font-semibold text-primary"
              >
                Ver tudo
              </Link>
            </div>
            {checkingAccounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center gap-3 border-b border-fill-medium py-[10px] last:border-none"
              >
                <Badge label={acc.name} color={acc.color ?? "#4A5568"} size="sm" />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-text-primary">{acc.name}</div>
                  <div className="text-[11px] text-text-muted">
                    {acc.kind === "checking"
                      ? "Conta corrente"
                      : acc.kind === "savings"
                        ? "Poupança"
                        : acc.kind === "investment"
                          ? "Investimento"
                          : "Cartão"}
                  </div>
                </div>
                <div className="font-mono text-[13px] font-semibold" style={{ color: acc.balanceCents >= 0 ? "var(--color-text-primary)" : "var(--color-danger)" }}>
                  {formatBRL(acc.balanceCents)}
                </div>
              </div>
            ))}
          </div>

          {/* Cartões card */}
          {creditCards.length > 0 && (
            <div className="mb-[14px] rounded-[16px] border border-border bg-surface px-4 py-4 shadow-card">
              <div className="mb-[14px] flex items-center justify-between">
                <span className="text-sm font-bold text-text-primary">Cartões de crédito</span>
                <Link
                  href="/cartoes"
                  className="text-[11px] font-semibold text-primary"
                >
                  Ver tudo
                </Link>
              </div>

              {/* Fatura total + Available */}
              <div className="mb-[4px] flex items-end gap-[14px]">
                <div>
                  <div className="mb-[3px] text-[11px] text-text-muted">Fatura total</div>
                  <div className="font-mono text-[22px] font-bold text-danger">
                    {formatBRL(totalCardSpent)}
                  </div>
                </div>
                <div className="ml-auto text-right">
                  <div className="mb-[3px] text-[11px] text-text-muted">Limite livre</div>
                  <div className="font-mono text-[14px] font-semibold text-primary">
                    {formatBRL(totalCardAvail)}
                  </div>
                </div>
              </div>

              {/* Per-card bars */}
              <div className="mt-3 flex flex-col gap-[11px]">
                {cardSpending.map((c) => (
                  <div key={c.card.id}>
                    <div className="mb-[5px] flex items-center gap-2">
                      <span className="h-[9px] w-[9px] flex-none rounded-[3px]" style={{ background: c.card.color ?? "#4A5568" }} />
                      <span className="flex-1 text-[12px] font-semibold text-text-primary">{c.card.name}</span>
                      <span className="font-mono text-[11px] font-semibold text-text-muted">{formatBRL(c.spent)}</span>
                    </div>
                    <div className="h-[6px] rounded-[4px] bg-fill-medium">
                      <div
                        className="h-full rounded-[4px] transition-all"
                        style={{ width: `${c.pct}%`, background: c.barColor }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contas a pagar card (mock: border danger tint + lista) */}
          {payables.length > 0 && (
            <div
              onClick={() => router.push("/a-pagar")}
              className="mb-[14px] cursor-pointer rounded-[16px] border bg-surface px-4 py-3.5 shadow-card"
              style={{ borderColor: "#F0CFC9" }}
            >
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-danger)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                  <span className="text-[12px] font-bold text-danger">
                    Contas a pagar · 7 dias
                  </span>
                </div>
                <span className="font-mono text-[13px] font-bold text-text-primary">
                  {formatBRL(totalPendingPayables)}
                </span>
              </div>

              {upcomingPayables.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-1"
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
                    <span className="text-[13px] text-text-primary">
                      {p.description}
                    </span>
                    <span
                      className="text-[10px] font-semibold"
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
                  <span className="font-mono text-[13px] font-semibold text-text-primary">
                    {formatBRL(p.amountCents)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Gastos por categoria (donut) */}
          <div className="mb-[14px] rounded-[16px] border border-border bg-surface px-4 py-4 shadow-card">
            <div className="mb-3.5 flex items-center justify-between">
              <span className="text-[13px] font-bold text-text-primary">
                Gastos por categoria
              </span>
              <Link
                href="/relatorios"
                className="text-[11px] font-semibold text-primary"
              >
                Relatórios
              </Link>
            </div>
            {donutData.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-text-muted">
                Sem despesas no período.
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div
                  className="relative h-[104px] w-[104px] flex-none rounded-full"
                  style={{ background: donutBg }}
                >
                  <div className="absolute inset-[23px] flex flex-col items-center justify-center rounded-full bg-surface">
                    <span className="text-[9px] text-text-muted">Total</span>
                    <span className="font-mono text-[14px] font-semibold text-text-primary">
                      {formatBRL(totalExpenses)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {donutData.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2"
                    >
                      <span
                        className="h-[9px] w-[9px] flex-none rounded-[3px]"
                        style={{ background: c.color }}
                      />
                      <span className="flex-1 text-[12px] text-text-secondary">
                        {c.name}
                      </span>
                      <span className="font-mono text-[12px] font-semibold text-text-primary">
                        {formatBRL(c.amountCents)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Insights card */}
          <div className="rounded-[16px] border border-border bg-surface px-4 py-4 shadow-card">
            <div className="mb-3 text-[13px] font-bold text-text-primary">Insights</div>
            {insights.length === 0 ? (
              <div className="text-[12px] text-text-muted">Nenhum insight disponível ainda.</div>
            ) : (
              insights.map((insight, i) => (
                <div key={i} className="flex gap-2.5 py-[7px]">
                  <span className="mt-[6px] h-[7px] w-[7px] flex-none rounded-full" style={{ background: insight.color }} />
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold text-text-primary">{insight.title}</div>
                    <div className="mt-[2px] text-[12px] leading-relaxed text-text-secondary">{insight.body}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

