"use client";

import StatusBar from "@/components/StatusBar";
import Link from "next/link";
import { StaleBanner } from "@/components/StaleBanner";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { useAppState } from "@/lib/state/app-state-context";
import NotificationsSheet from "@/features/profile/NotificationsSheet";
import { useEffectiveProfile } from "@/features/profile/hooks";

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
      <div
        className="px-5 pt-1 pb-6 sm:px-8 lg:px-12"
        style={{
          background: "linear-gradient(165deg, #0F6B45, #0A3A28)",
        }}
      >
        {/* Hero skeleton */}
        <div className="mb-5 mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Skeleton variant="circle" width={38} height={38} style={{ background: "rgba(255,255,255,0.2)" }} />
            <div className="flex flex-col gap-1.5">
              <Skeleton variant="text" width={80} height={10} style={{ background: "rgba(255,255,255,0.2)" }} />
              <Skeleton variant="text" width={60} height={14} style={{ background: "rgba(255,255,255,0.3)" }} />
            </div>
          </div>
          <Skeleton variant="circle" width={38} height={38} style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>
        <Skeleton variant="text" width={140} height={10} style={{ background: "rgba(255,255,255,0.15)" }} className="mb-3" />
        <Skeleton variant="text" width={80} height={10} style={{ background: "rgba(255,255,255,0.15)" }} className="mb-2" />
        <Skeleton width="60%" height={40} style={{ background: "rgba(255,255,255,0.25)" }} className="mb-5" />
        <div className="flex gap-2">
          <Skeleton height={48} className="flex-1" style={{ background: "rgba(255,255,255,0.15)" }} />
          <Skeleton height={48} className="flex-1" style={{ background: "rgba(255,255,255,0.15)" }} />
          <Skeleton height={48} className="flex-1" style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>
      </div>
      <div className="px-5 pt-4 pb-6 sm:px-8 lg:px-12">
        {/* KPI delta row skeleton */}
        <div className="mb-[14px] grid grid-cols-2 gap-2.5">
          <Skeleton variant="card" height={72} />
          <Skeleton variant="card" height={72} />
        </div>
        {/* Account list skeleton */}
        <div className="mb-[14px] flex flex-col gap-3 rounded-[16px] border border-border bg-surface p-4">
          <Skeleton variant="text" width={120} height={14} />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton variant="circle" width={28} height={28} />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton variant="text" width="50%" />
                <Skeleton variant="text" width="30%" height={9} />
              </div>
              <Skeleton variant="text" width={70} />
            </div>
          ))}
        </div>
        {/* Donut skeleton */}
        <Skeleton variant="card" height={140} />
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
  const { accounts, transactions, categories, payables, budgets, cardStatements, quickInsights, loading, error } =
    useAppState();
  const profile = useEffectiveProfile();
  const router = useRouter();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

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
    // Pick the most recent month that has at least one income transaction
    // as the "current" reference, then compare against the calendar month
    // immediately before it. Avoids the -100% trap when the wall clock is
    // in a month with no data (e.g. July 2 with all transactions in June).
    const months = new Map<string, number>();
    for (const t of transactions) {
      if (t.kind !== "income") continue;
      const d = new Date(t.date + "T12:00:00");
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      months.set(key, (months.get(key) ?? 0) + t.amountCents);
    }
    const sorted = Array.from(months.keys()).sort();
    if (sorted.length === 0) return null;
    const recentKey = sorted[sorted.length - 1]!;
    const [yStr, mStr] = recentKey.split("-");
    const recentYear = Number(yStr);
    const recentMonth = Number(mStr);
    const prevMonth = recentMonth === 0 ? 11 : recentMonth - 1;
    const prevYear = recentMonth === 0 ? recentYear - 1 : recentYear;
    const prevKey = `${prevYear}-${prevMonth}`;
    const curr = months.get(recentKey) ?? 0;
    const prev = months.get(prevKey) ?? 0;
    if (prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  }, [transactions]);

  const expenseDeltaPct = useMemo(() => {
    // Same logic as above, but for expense transactions.
    const months = new Map<string, number>();
    for (const t of transactions) {
      if (t.kind !== "expense") continue;
      const d = new Date(t.date + "T12:00:00");
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      months.set(key, (months.get(key) ?? 0) + t.amountCents);
    }
    const sorted = Array.from(months.keys()).sort();
    if (sorted.length === 0) return null;
    const recentKey = sorted[sorted.length - 1]!;
    const [yStr, mStr] = recentKey.split("-");
    const recentYear = Number(yStr);
    const recentMonth = Number(mStr);
    const prevMonth = recentMonth === 0 ? 11 : recentMonth - 1;
    const prevYear = recentMonth === 0 ? recentYear - 1 : recentYear;
    const prevKey = `${prevYear}-${prevMonth}`;
    const curr = months.get(recentKey) ?? 0;
    const prev = months.get(prevKey) ?? 0;
    if (prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  }, [transactions]);

  // ── Donut: gastos por MACRO categoria (agregando subcategorias) ──
  // Each transaction's categoryId is resolved to its macro name:
  // - Categories with parentId → resolved to parent category name
  // - Category name containing " > " → prefix before " > " is the macro
  // - Standalone category → its own name is the macro
  // This prevents the donut from showing "Moradia > Aluguel" alongside "Moradia".
  const totalExpensesForDonut = transactions
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.amountCents, 0);

  const donutData = useMemo(() => {
    // Build parent lookup for parentId resolution
    const parentById = new Map<string, string>();
    for (const c of categories) {
      parentById.set(c.id, c.name);
    }

    // Resolve categoryId → macro name
    const idToMacro = new Map<string, string>();
    for (const c of categories) {
      if (c.parentId) {
        const parentName = parentById.get(c.parentId) ?? c.parentId;
        idToMacro.set(c.id, parentName);
      } else if (c.name.includes(" > ")) {
        const macro = c.name.split(" > ")[0]!.trim();
        idToMacro.set(c.id, macro);
      }
      // Standalone categories are already their own macro — no entry needed
    }

    // Aggregate: macro name → total cents
    const macroTotals = new Map<string, number>();
    for (const t of transactions) {
      if (t.kind !== "expense") continue;
      const macro = idToMacro.get(t.categoryId)
        ?? parentById.get(t.categoryId)
        ?? "Outros";
      macroTotals.set(macro, (macroTotals.get(macro) ?? 0) + t.amountCents);
    }

    const total = totalExpensesForDonut || 1;
    return Array.from(macroTotals.entries())
      .map(([name, amt]) => ({ name, amountCents: amt, pct: (amt / total) * 100 }))
      .sort((a, b) => b.amountCents - a.amountCents)
      .map((r, i) => ({ ...r, color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length].color }));
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
    // Prefer statement total over transaction-based (correct for live data;
    // transactions filter is a fallback for mock/test without statements).
    const stmts = cardStatements
      .filter((s) => s.accountId === card.id)
      .sort((a, b) => b.cycleYearMonth.localeCompare(a.cycleYearMonth));
    const spent = stmts[0]?.totalCents ?? transactions
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
  const fallbackInsights: InsightItem[] = [];

  // 1. Savings rate
  if (totalIncome > 0) {
    const savingsRate = ((totalIncome - totalExpenses) / totalIncome) * 100;
    const isGood = savingsRate >= 20;
    const isWarn = savingsRate >= 5;
    fallbackInsights.push({
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

  // 2. Top expense category — aggregated by MACRO (same logic as donut)
  // so the insight says "Moradia" not "Moradia > Aluguel".
  {
    const parentById = new Map<string, string>();
    for (const c of categories) parentById.set(c.id, c.name);
    const idToMacro = new Map<string, string>();
    for (const c of categories) {
      if (c.parentId) {
        idToMacro.set(c.id, parentById.get(c.parentId) ?? c.parentId);
      } else if (c.name.includes(" > ")) {
        idToMacro.set(c.id, c.name.split(" > ")[0]!.trim());
      }
    }
    const macroTotals = new Map<string, number>();
    for (const t of transactions) {
      if (t.kind !== "expense") continue;
      const macro = idToMacro.get(t.categoryId)
        ?? parentById.get(t.categoryId)
        ?? "Outros";
      macroTotals.set(macro, (macroTotals.get(macro) ?? 0) + t.amountCents);
    }
    const sorted = Array.from(macroTotals.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    if (sorted.length > 0) {
      const [topMacro, topAmount] = sorted[0]!;
      fallbackInsights.push({
        color: "var(--color-info)",
        title: "Maior categoria de gasto",
        body: `${topMacro} — ${formatBRL(topAmount)} no período.`,
      });
    }
  }

  // 3. Budgets: check real spent from transactions when budget.spentCents
  // is 0 (stale data). Skip the insight entirely when maxUsage === 0.
  {
    const effectiveUsage = budgets.map((b) => {
      if (b.amountCents <= 0) return { name: b.name, pct: 0 };
      const realSpent =
        b.spentCents > 0
          ? b.spentCents
          : transactions
              .filter((t) => t.categoryId === b.categoryId && t.kind === "expense")
              .reduce((s, t) => s + t.amountCents, 0);
      return { name: b.name, pct: (realSpent / b.amountCents) * 100 };
    });
    const nearLimit = effectiveUsage.filter((u) => u.pct >= 90);
    if (nearLimit.length > 0) {
      const topName = nearLimit.sort((a, b) => b.pct - a.pct)[0]!.name;
      const body =
        nearLimit.length === 1
          ? `${topName} está perto do limite (${formatPct(90)}+).`
          : `${nearLimit.length} orçamentos perto do limite. Mais pressionado: ${topName}.`;
      fallbackInsights.push({
        color: "var(--color-warning)",
        title: "Orçamentos no limite",
        body,
      });
    } else if (effectiveUsage.length > 0) {
      const maxEntry = effectiveUsage.reduce((max, u) =>
        u.pct > max.pct ? u : max,
      );
      if (maxEntry.pct > 0) {
        fallbackInsights.push({
          color: "var(--color-primary)",
          title: "Orçamentos sob controle",
          body: `O mais utilizado é ${maxEntry.name} (${formatPct(maxEntry.pct)}).`,
        });
      }
      // If maxEntry.pct === 0, skip the insight (no representative data).
    }
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
    fallbackInsights.push({
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

  // ── Insights: prefer specific over generic ──
  // If quickInsights from the API are available, keep only those that
  // mention a concrete financial amount (body contains "R$"). Generic
  // items like "Mês equilibrado" (body has no R$) are dropped so they
  // don't replace the more specific fallback insights (top category,
  // next payable, budget pressure, etc.).
  const specificQuick = (quickInsights ?? []).filter(
    (item) => item.body && item.body.includes("R$"),
  );
  const insights: InsightItem[] = [
    ...fallbackInsights,
    ...specificQuick.map((item) => ({
      title: item.title,
      body: item.body,
      color:
        item.severity === "good"
          ? "var(--color-primary)"
          : item.severity === "warn"
            ? "var(--color-warning)"
            : "var(--color-info)",
    })),
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />

      <StaleBanner
        domains={["accounts", "transactions", "payables", "budgets"]}
        onRetry={() => router.refresh()}
      />

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
          data-testid="hero-area"
          className="px-5 pt-1 sm:px-8 lg:px-12"
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
                onClick={() => router.push("/perfil")}
                aria-label="Abrir perfil"
                className="flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full font-mono text-[15px] font-semibold text-white"
                style={{ background: profile.avatarColor }}
              >
                {(profile.name ?? "?").charAt(0).toUpperCase()}
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
                <div className="text-[15px] font-bold text-white">{profile.name}</div>
              </div>
            </div>
            <button
              type="button"
              aria-label="Notificações"
              onClick={() => setNotificationsOpen(true)}
              className="relative flex h-[38px] w-[38px] items-center justify-center rounded-full text-white"
              style={{ background: "rgba(255,255,255,.14)" }}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              <div className="absolute right-[9px] top-[8px] h-[7px] w-[7px] rounded-full border-[1.5px]"
                style={{ background: "#E0A33E", borderColor: "#0C4430" }}
              />
            </button>
          </div>

          {/* Page heading */}
          <h1 className="mb-[3px] text-[10px] font-semibold uppercase tracking-wider text-white/50">
            Resumo financeiro
          </h1>

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
        <div className="px-5 pb-1 pt-2 sm:px-8 lg:px-12">
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
        <div className="px-5 pb-6 pt-4 sm:px-8 lg:px-12">
          {/* KPI delta row */}
          <div
            data-testid="kpi-delta-row"
            className="mb-[14px] grid grid-cols-2 gap-2.5 sm:gap-4 lg:gap-6"
          >
            <div className="rounded-[14px] border border-border bg-surface p-3 shadow-card">
              <div className="mb-[2px] text-[11px] font-semibold text-text-primary">
                Receitas
              </div>
              <div className="mb-[6px] text-[10px] text-text-muted">
                vs mês anterior
              </div>
              <div
                className="flex items-center gap-1.5 text-primary"
                title="Variação de receitas do mês atual comparado ao mês anterior"
                aria-label="Variação de receitas do mês atual comparado ao mês anterior"
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
              <div className="mb-[2px] text-[11px] font-semibold text-text-primary">
                Despesas
              </div>
              <div className="mb-[6px] text-[10px] text-text-muted">
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
              <button
                key={acc.id}
                type="button"
                data-testid="account-row"
                onClick={() => router.push(`/contas?accountId=${encodeURIComponent(acc.id)}`)}
                className="flex w-full items-center gap-3 border-b border-fill-medium py-[10px] text-left last:border-none"
                aria-label={`Abrir ${acc.name} em Contas`}
              >
                <Badge label={acc.name} color={acc.color ?? "#4A5568"} size="sm" />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-text-primary">{acc.name}</div>
                  <div className="text-[11px] text-text-muted">
                    {acc.kind === "credit_card"
                      ? "Cartão"
                      : acc.kind === "checking"
                        ? "Conta corrente"
                        : acc.kind === "savings"
                          ? "Poupança"
                          : acc.kind === "investment"
                            ? "Investimento"
                            : acc.kind === "cash"
                              ? "Dinheiro"
                              : acc.kind === "bank"
                                ? "Conta"
                                : "Outro"}
                  </div>
                </div>
                <div className="font-mono text-[13px] font-semibold" style={{ color: acc.balanceCents >= 0 ? "var(--color-text-primary)" : "var(--color-danger)" }}>
                  {formatBRL(acc.balanceCents)}
                </div>
              </button>
            ))}
          </div>

          {/* Cartões card — rico: agregado + per-card com limite e fechamento/vencimento */}
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

              {/* Aggregate: fatura / limite livre / limite total */}
              <div className="mb-3 flex items-end justify-between rounded-[12px] bg-fill-light px-3 py-3">
                <div className="text-center">
                  <div className="mb-[2px] text-[10px] font-semibold uppercase tracking-wide text-text-muted">Fatura atual</div>
                  <div className="font-mono text-[22px] font-bold leading-none text-danger">
                    {formatBRL(totalCardSpent)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="mb-[2px] text-[10px] font-semibold uppercase tracking-wide text-text-muted">Limite total</div>
                  <div className="font-mono text-[14px] font-semibold text-text-primary">
                    {formatBRL(totalCardLimit)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="mb-[2px] text-[10px] font-semibold uppercase tracking-wide text-text-muted">Limite livre</div>
                  <div className="font-mono text-[14px] font-semibold text-primary">
                    {formatBRL(totalCardAvail)}
                  </div>
                </div>
              </div>

              {/* Per-card tiles — cada cartão com info completa */}
              <div className="flex flex-col gap-2">
                {cardSpending.map((c) => (
                  <button
                    key={c.card.id}
                    type="button"
                    data-testid="card-row"
                    onClick={() => router.push(`/cartoes?cardId=${encodeURIComponent(c.card.id)}`)}
                    aria-label={`Abrir ${c.card.name} em Cartões`}
                    className="flex w-full items-center gap-3 rounded-[12px] bg-fill-light px-3 py-2.5 text-left transition-colors hover:bg-fill-medium"
                  >
                    <span
                      className="flex h-9 w-9 flex-none items-center justify-center rounded-[8px] font-mono text-[11px] font-bold text-white"
                      style={{ background: c.card.color ?? "#4A5568" }}
                    >
                      {(c.card.name ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="truncate text-[13px] font-semibold text-text-primary">{c.card.name}</span>
                        <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-[10px] font-bold text-text-secondary">
                          {c.pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-[5px] rounded-[4px] bg-surface">
                        <div
                          className="h-full rounded-[4px] transition-all"
                          style={{ width: `${c.pct}%`, background: c.barColor }}
                        />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-text-muted">
                        {c.card.closingDay && (
                          <span>Fecha dia {c.card.closingDay}</span>
                        )}
                        {c.card.dueDay && (
                          <span>Vence dia {c.card.dueDay}</span>
                        )}
                        <span>Limite {formatBRL(c.limit)}</span>
                        <span>{formatBRL(c.limit - c.spent)} livre</span>
                      </div>
                    </div>
                    <span className="font-mono text-[12px] font-semibold text-danger flex-none">{formatBRL(c.spent)}</span>
                  </button>
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
                    {`Contas a pagar · ${upcomingPayables.length} pendente${upcomingPayables.length !== 1 ? 's' : ''}`}
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

          {/* Gastos por categoria (donut + lista) */}
          <div className="mb-[14px] rounded-[16px] border border-border bg-surface px-4 py-4 shadow-card">
            <div className="mb-3.5 flex items-center justify-between">
              <span className="text-[13px] font-bold text-text-primary">
                Gastos por categoria
              </span>
              <span className="font-mono text-[12px] font-semibold text-text-primary">
                Total: {formatBRL(totalExpenses)}
              </span>
            </div>
            {donutData.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-text-muted">
                Sem despesas no período.
              </div>
            ) : (
              <div className="flex items-center gap-4">
                {/* Donut chart */}
                <div
                  data-testid="category-donut"
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
                {/* Legend list */}
                <div className="flex flex-1 flex-col gap-2">
                  {donutData.map((c, i) => (
                    <div
                      key={`macro-${i}`}
                      data-testid="category-row"
                      className="flex w-full items-center gap-2 rounded-md py-1 pl-1 pr-1"
                    >
                      <span
                        className="h-[9px] w-[9px] flex-none rounded-[3px]"
                        style={{ background: c.color }}
                      />
                      <span className="flex-1 text-[12px] text-text-secondary">
                        {c.name}
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-text-muted">
                        {c.pct.toFixed(0)}%
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

      <NotificationsSheet
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
  );
}

