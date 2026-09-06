"use client";

import StatusBar from "@/components/StatusBar";
import Link from "next/link";
import { StaleBanner } from "@/components/StaleBanner";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useAppState } from "@/lib/state/app-state-context";
import NotificationsSheet from "@/features/profile/NotificationsSheet";
import { useEffectiveProfile } from "@/features/profile/hooks";
import { dashboardSummaryGate } from "@/features/dashboard-summary-gate";
import { fetchPendingOperations } from "@/lib/api/endpoints";
import { isApiConfigured } from "@/lib/api/client";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import {
  Bell,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Wallet,
  PieChart,
  Sparkles,
} from "lucide-react";

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
        <div className="mb-[14px] flex flex-col gap-3 rounded-[18px] border border-border-subtle bg-surface-1 p-4">
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
  const {
    accounts,
    transactions,
    categories,
    payables,
    budgets,
    cardStatements,
    quickInsights,
    dashboardSummary,
    refreshDashboardSummary,
    loading,
    error,
  } = useAppState();
  const profile = useEffectiveProfile();
  const router = useRouter();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!dashboardSummary && refreshDashboardSummary) {
      refreshDashboardSummary();
    }
  }, [dashboardSummary, refreshDashboardSummary]);

  useEffect(() => {
    if (!isApiConfigured()) return;
    let cancelled = false;
    fetchPendingOperations("pending")
      .then((items) => {
        if (!cancelled) setPendingCount(items.length);
      })
      .catch(() => {
        if (!cancelled) setPendingCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNew = (kind: "expense" | "income" | "transfer") => {
    if (onNewTransaction) onNewTransaction(kind);
    else if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("pwa:open-tx", { detail: { kind } }),
      );
    }
  };

  const incomeDeltaPct = useMemo(() => {
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

  const totalExpensesForDonut = transactions
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.amountCents, 0);

  const donutData = useMemo(() => {
    const parentById = new Map<string, string>();
    for (const c of categories) {
      parentById.set(c.id, c.name);
    }

    const idToMacro = new Map<string, string>();
    for (const c of categories) {
      if (c.parentId) {
        const parentName = parentById.get(c.parentId) ?? c.parentId;
        idToMacro.set(c.id, parentName);
      } else if (c.name.includes(" > ")) {
        const macro = c.name.split(" > ")[0]!.trim();
        idToMacro.set(c.id, macro);
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
    parts.push(`var(--surface-2) ${cumulative}deg 360deg`);
    return `conic-gradient(${parts.join(", ")})`;
  }, [donutData]);

  if (loading) {
    return <LoadingScreen />;
  }

  const checkingAccounts = accounts.filter((a) => a.kind !== "credit_card");
  const creditCards = accounts.filter((a) => a.kind === "credit_card");

  const hasServerSummary = dashboardSummaryGate({ serverSummary: dashboardSummary });

  const totalBalance = hasServerSummary
    ? (dashboardSummary?.totalBalanceCents ?? (dashboardSummary as unknown as { totals?: { balanceCents?: number } })?.totals?.balanceCents ?? 0)
    : null;

  const totalIncome = hasServerSummary
    ? (dashboardSummary?.monthIncomeCents ?? (dashboardSummary as unknown as { totals?: { incomeCents?: number } })?.totals?.incomeCents ?? 0)
    : null;

  const totalExpenses = hasServerSummary
    ? (dashboardSummary?.monthExpenseCents ?? (dashboardSummary as unknown as { totals?: { expenseCents?: number } })?.totals?.expenseCents ?? 0)
    : null;

  const netResult = hasServerSummary
    ? (dashboardSummary?.monthNetCents ?? (totalIncome !== null && totalExpenses !== null ? totalIncome - totalExpenses : 0))
    : null;

  const cardSpending = creditCards.map((card) => {
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

  const pendingPayables = payables.filter((p) => p.status === "pending" || p.status === "overdue");
  const totalPendingPayables = pendingPayables.reduce((s, p) => s + p.amountCents, 0);

  const fallbackInsights: InsightItem[] = [];

  if (hasServerSummary && totalIncome !== null && totalIncome > 0 && totalExpenses !== null) {
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
    }
  }

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
          className="px-5 pt-[calc(8px+env(safe-area-inset-top))] sm:px-8 lg:px-12"
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
                className="flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full font-mono text-[15px] font-semibold text-white shadow-sm ring-1 ring-white/10"
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
                <div className="text-[15px] font-bold text-white tracking-tight">{profile.name}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="lg:hidden">
                <WorkspaceSwitcher compact variant="hero" />
              </div>
              <button
                type="button"
                aria-label="Notificações"
                onClick={() => setNotificationsOpen(true)}
                className="relative flex h-[38px] w-[38px] items-center justify-center rounded-full text-white transition-all hover:bg-white/20 active:scale-95"
                style={{ background: "rgba(255,255,255,.14)" }}
              >
                <Bell size={18} strokeWidth={2} />
                {/* A9: dot via tokens e só quando há algo pedindo atenção
                    (operações pendentes de aprovação) */}
                {pendingCount !== null && pendingCount > 0 && (
                  <div
                    aria-hidden="true"
                    className="absolute right-[9px] top-[8px] h-[7px] w-[7px] rounded-full bg-warning ring-1 ring-white/40"
                  />
                )}
              </button>
            </div>
          </div>

          {/* Page heading */}
          <h1 className="mb-[3px] text-[10px] font-bold uppercase tracking-wider text-white/60">
            Resumo financeiro
          </h1>

          {/* Saldo */}
          <div className="mb-[5px] text-xs font-medium text-white/80">Saldo total · contas</div>
          <div
            className="mb-[18px] font-mono tabular-nums text-[38px] sm:text-[44px] font-bold text-white tracking-tight"
            style={{ letterSpacing: "-0.02em", lineHeight: 1 }}
          >
            {totalBalance !== null ? formatBRL(totalBalance) : "—"}
          </div>

          {/* Mini-stats row */}
          <div className="flex gap-[9px]">
            <div
              className="flex-1 rounded-[14px] p-[10px_12px] border border-white/10"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              <div className="mb-[3px] text-[11px] font-medium text-white/70">Receitas</div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-[13px] font-semibold text-white">
                {totalIncome !== null ? formatBRL(totalIncome) : "—"}
              </div>
            </div>
            <div
              className="flex-1 rounded-[14px] p-[10px_12px] border border-white/10"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              <div className="mb-[3px] text-[11px] font-medium text-white/70">Despesas</div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-[13px] font-semibold text-white">
                {totalExpenses !== null ? formatBRL(totalExpenses) : "—"}
              </div>
            </div>
            <div
              className="flex-1 rounded-[14px] p-[10px_12px] border border-white/10"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              <div className="mb-[3px] text-[11px] font-medium text-white/70">Resultado</div>
              <div
                className="overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-[13px] font-semibold"
                style={{
                  color:
                    netResult === null
                      ? "rgba(255,255,255,0.7)"
                      : netResult >= 0
                        ? "#7FE3B0"
                        : "#F9A8A2",
                }}
              >
                {netResult !== null ? formatBRL(netResult) : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="px-5 pb-1 pt-3 sm:px-8 lg:px-12">
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
            <button
              type="button"
              onClick={() => handleNew("expense")}
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
              onClick={() => handleNew("income")}
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
              onClick={() => handleNew("transfer")}
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

        {/* ── Content area ── */}
        <div className="px-5 pb-6 pt-4 sm:px-8 lg:px-12">
          {pendingCount !== null && pendingCount > 0 && (
            <button
              type="button"
              onClick={() => router.push("/pending")}
              data-testid="pending-banner"
              className="mb-[14px] flex w-full items-center justify-between rounded-[16px] border border-warning/40 bg-warning-tint px-4 py-3 text-left shadow-card transition-all hover:bg-warning-tint/80"
            >
              <span className="flex items-center gap-2.5 text-[13px] font-bold text-warning">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-warning text-white text-[11px] font-bold">
                  {pendingCount}
                </span>
                {pendingCount} operação{pendingCount !== 1 ? "ões" : ""} pendente{pendingCount !== 1 ? "s" : ""} — requer aprovação
              </span>
              <span className="text-[11px] font-bold text-warning">Ver →</span>
            </button>
          )}

          {/* KPI delta row */}
          <div
            data-testid="kpi-delta-row"
            className="mb-[14px] grid grid-cols-2 gap-2.5 sm:gap-4 lg:gap-6"
          >
            <div className="rounded-[18px] border border-border-subtle bg-surface-1 p-3.5 shadow-card">
              <div className="mb-[2px] text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Receitas
              </div>
              <div className="mb-[6px] text-[10px] text-text-muted font-medium">
                vs mês anterior
              </div>
              <div
                className="flex items-center gap-1.5 text-primary"
                title="Variação de receitas do mês atual comparado ao mês anterior"
                aria-label="Variação de receitas do mês atual comparado ao mês anterior"
              >
                <TrendingUp size={16} strokeWidth={2.4} />
                <span className="font-mono tabular-nums text-[18px] font-bold">
                  {incomeDeltaPct === null ? "—" : `${incomeDeltaPct >= 0 ? "+" : ""}${incomeDeltaPct.toFixed(0)}%`}
                </span>
              </div>
            </div>
            <div className="rounded-[18px] border border-border-subtle bg-surface-1 p-3.5 shadow-card">
              <div className="mb-[2px] text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Despesas
              </div>
              <div className="mb-[6px] text-[10px] text-text-muted font-medium">
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
                {expenseDeltaPct !== null && expenseDeltaPct > 0 ? (
                  <TrendingDown size={16} strokeWidth={2.4} />
                ) : (
                  <TrendingUp size={16} strokeWidth={2.4} />
                )}
                <span className="font-mono tabular-nums text-[18px] font-bold">
                  {expenseDeltaPct === null
                    ? "—"
                    : `${expenseDeltaPct >= 0 ? "+" : ""}${expenseDeltaPct.toFixed(0)}%`}
                </span>
              </div>
            </div>
          </div>

          {/* Account list card */}
          <div className="mb-[14px] overflow-hidden rounded-[18px] border border-border-subtle bg-surface-1 px-4 py-3 shadow-card">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[14px] font-bold text-text-primary">Minhas contas</span>
              <Link
                href="/contas"
                className="text-[11px] font-bold text-primary hover:underline"
              >
                Ver tudo
              </Link>
            </div>
            {/* A4: empty state com CTA para o fluxo existente de Contas */}
            {checkingAccounts.length === 0 ? (
              <EmptyState
                icon={<Wallet size={24} />}
                title="Nenhuma conta ainda"
                description="Adicione sua primeira conta para ver o saldo total aqui."
                action={
                  <Button size="sm" onClick={() => router.push("/contas")}>
                    Adicionar conta
                  </Button>
                }
              />
            ) : (
            checkingAccounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                data-testid="account-row"
                onClick={() => router.push(`/contas?accountId=${encodeURIComponent(acc.id)}`)}
                className="flex w-full items-center gap-3 border-b border-border-subtle py-2.5 text-left last:border-none hover:bg-surface-2/60 transition-colors rounded-[10px] px-1"
                aria-label={`Abrir ${acc.name} em Contas`}
              >
                <Badge label={acc.name} color={acc.color ?? "#4A5568"} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[13px] font-semibold text-text-primary">{acc.name}</div>
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
                <div className="font-mono tabular-nums text-[13px] font-bold" style={{ color: acc.balanceCents >= 0 ? "var(--color-text-primary)" : "var(--color-danger)" }}>
                  {formatBRL(acc.balanceCents)}
                </div>
              </button>
            )))}
          </div>

          {/* Cartões card */}
          {creditCards.length > 0 && (
            <div className="mb-[14px] rounded-[18px] border border-border-subtle bg-surface-1 px-4 py-4 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[14px] font-bold text-text-primary">Cartões de crédito</span>
                <Link
                  href="/cartoes"
                  className="text-[11px] font-bold text-primary hover:underline"
                >
                  Ver tudo
                </Link>
              </div>

              {/* Aggregate: fatura / limite livre / limite total */}
              <div className="mb-3 flex items-end justify-between rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3">
                <div className="text-center">
                  <div className="mb-[2px] text-[10px] font-bold uppercase tracking-wider text-text-muted">Fatura atual</div>
                  <div className="font-mono tabular-nums text-[20px] font-bold leading-none text-danger">
                    {formatBRL(totalCardSpent)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="mb-[2px] text-[10px] font-bold uppercase tracking-wider text-text-muted">Limite total</div>
                  <div className="font-mono tabular-nums text-[13px] font-semibold text-text-primary">
                    {formatBRL(totalCardLimit)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="mb-[2px] text-[10px] font-bold uppercase tracking-wider text-text-muted">Limite livre</div>
                  <div className="font-mono tabular-nums text-[13px] font-bold text-primary">
                    {formatBRL(totalCardAvail)}
                  </div>
                </div>
              </div>

              {/* Per-card tiles */}
              <div className="flex flex-col gap-2">
                {cardSpending.map((c) => (
                  <button
                    key={c.card.id}
                    type="button"
                    data-testid="card-row"
                    onClick={() => router.push(`/cartoes?cardId=${encodeURIComponent(c.card.id)}`)}
                    aria-label={`Abrir ${c.card.name} em Cartões`}
                    className="flex w-full items-center gap-3 rounded-[14px] border border-border-subtle bg-surface-2/60 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <span
                      className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] font-mono text-[11px] font-bold text-white shadow-xs"
                      style={{ background: c.card.color ?? "#4A5568" }}
                    >
                      {(c.card.name ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="truncate text-[13px] font-bold text-text-primary">{c.card.name}</span>
                        <span className="rounded-full bg-surface-1 border border-border-subtle px-2 py-0.5 font-mono text-[10px] font-bold text-text-secondary">
                          {c.pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-[5px] rounded-full bg-surface-3 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${c.pct}%`, background: c.barColor }}
                        />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-medium text-text-muted">
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
                    <span className="font-mono tabular-nums text-[13px] font-bold text-danger flex-none">{formatBRL(c.spent)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Contas a pagar card */}
          {payables.length > 0 && (
            <div
              onClick={() => router.push("/a-pagar")}
              className="mb-[14px] cursor-pointer rounded-[18px] border border-danger/30 bg-surface-1 px-4 py-3.5 shadow-card hover:border-danger/50 transition-colors"
            >
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-danger flex-none" />
                  <span className="text-[12px] font-bold text-danger">
                    {`Contas a pagar · ${upcomingPayables.length} pendente${upcomingPayables.length !== 1 ? 's' : ''}`}
                  </span>
                </div>
                <span className="font-mono tabular-nums text-[13px] font-bold text-text-primary">
                  {formatBRL(totalPendingPayables)}
                </span>
              </div>

              {upcomingPayables.slice(0, 3).map((p) => (
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
          )}

          {/* Gastos por categoria (donut + lista) */}
          <div className="mb-[14px] rounded-[18px] border border-border-subtle bg-surface-1 px-4 py-4 shadow-card">
            <div className="mb-3.5 flex items-center justify-between">
              <span className="text-[13px] font-bold text-text-primary">
                Gastos por categoria
              </span>
              <span className="font-mono tabular-nums text-[12px] font-semibold text-text-primary">
                Total: {totalExpenses !== null ? formatBRL(totalExpenses) : "—"}
              </span>
            </div>
            {donutData.length === 0 ? (
              <EmptyState
                icon={<PieChart size={24} />}
                title="Sem despesas no período"
                description="Registre sua primeira despesa para ver a distribuição por categoria."
                action={
                  <Button size="sm" onClick={() => handleNew("expense")}>
                    Registrar despesa
                  </Button>
                }
              />
            ) : (
              <div className="flex items-center gap-4">
                {/* Donut chart */}
                <div
                  data-testid="category-donut"
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
                  {donutData.map((c, i) => (
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

          {/* Insights card */}
          <div className="rounded-[18px] border border-border-subtle bg-surface-1 px-4 py-4 shadow-card">
            <div className="mb-3 text-[13px] font-bold text-text-primary">Insights</div>
            {insights.length === 0 ? (
              <EmptyState
                icon={<Sparkles size={24} />}
                title="Sem insights por enquanto"
                description="Assim que houver movimentação, o TED traz observações aqui."
              />
            ) : (
              insights.map((insight, i) => (
                <div key={i} className="flex gap-2.5 py-[7px] border-t border-border-subtle/50 first:border-none">
                  <span className="mt-[6px] h-2 w-2 flex-none rounded-full" style={{ background: insight.color }} />
                  <div className="flex-1">
                    <div className="text-[13px] font-bold text-text-primary">{insight.title}</div>
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
