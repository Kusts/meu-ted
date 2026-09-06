"use client";

import StatusBar from "@/components/StatusBar";
import { StaleBanner } from "@/components/StaleBanner";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useAppState } from "@/lib/state/app-state-context";
import NotificationsSheet from "@/features/profile/NotificationsSheet";
import { useEffectiveProfile } from "@/features/profile/hooks";
import { dashboardSummaryGate } from "@/features/dashboard-summary-gate";
import { fetchPendingOperations } from "@/lib/api/endpoints";
import { isApiConfigured } from "@/lib/api/client";
import { useMonthDeltas } from "./hooks/useMonthDeltas";
import { useCategoryBreakdown } from "./hooks/useCategoryBreakdown";
import { useFallbackInsights } from "./hooks/useFallbackInsights";
import { useHideBalance } from "./hooks/useHideBalance";
import { useAnimatedNumber } from "./hooks/useAnimatedNumber";
import { LoadingScreen } from "./components/LoadingScreen";
import { HeroSection } from "./components/HeroSection";
import { QuickActions, type NewTxKind } from "./components/QuickActions";
import { DeltaCards } from "./components/DeltaCards";
import { AccountsCard } from "./components/AccountsCard";
import { CreditCardsCard } from "./components/CreditCardsCard";
import { PayablesCard } from "./components/PayablesCard";
import { CategoryDonutCard } from "./components/CategoryDonutCard";
import { InsightsCard } from "./components/InsightsCard";

interface HomePageProps {
  onNewTransaction?: (kind: NewTxKind) => void;
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

  const handleNew = (kind: NewTxKind) => {
    if (onNewTransaction) onNewTransaction(kind);
    else if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("pwa:open-tx", { detail: { kind } }),
      );
    }
  };

  const incomeDeltaPct = useMonthDeltas(transactions, "income");
  const expenseDeltaPct = useMonthDeltas(transactions, "expense");
  const macros = useCategoryBreakdown(transactions, categories);

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

  const insights = useFallbackInsights({
    transactions,
    budgets,
    payables,
    quickInsights,
    monthIncome: totalIncome,
    monthExpenses: totalExpenses,
    macros,
  });

  const { hidden: balanceHidden, toggle: toggleBalance } = useHideBalance();
  const animatedBalance = useAnimatedNumber(totalBalance ?? 0);

  if (loading) {
    return <LoadingScreen />;
  }

  const checkingAccounts = accounts.filter((a) => a.kind !== "credit_card");
  const creditCards = accounts.filter((a) => a.kind === "credit_card");

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />

      <StaleBanner
        domains={["accounts", "transactions", "payables", "budgets"]}
        onRetry={() => router.refresh()}
      />

      {error && (
        <div
          role="alert"
          className="mx-5 mt-2 flex items-center gap-2 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger"
        >
          <AlertCircle size={15} className="flex-none text-danger" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <main
        className="flex flex-1 flex-col overflow-y-auto pb-[var(--tab-bar-height)]"
      >
        <HeroSection
          profile={profile}
          pendingCount={pendingCount}
          totalBalance={totalBalance}
          totalIncome={totalIncome}
          totalExpenses={totalExpenses}
          netResult={netResult}
          balanceHidden={balanceHidden}
          onToggleBalance={toggleBalance}
          animatedBalance={animatedBalance}
          onOpenProfile={() => router.push("/perfil")}
          onOpenNotifications={() => setNotificationsOpen(true)}
        />

        <QuickActions onNew={handleNew} />

        {/* ── Content area ── */}
        {/* pb-24: respiro p/ CTAs finais não colidirem com o FAB do TED (fixed bottom-88px) */}
        <div className="px-5 pb-24 pt-4 sm:px-8 lg:px-12">
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

          <DeltaCards incomeDeltaPct={incomeDeltaPct} expenseDeltaPct={expenseDeltaPct} />

          <AccountsCard
            accounts={checkingAccounts}
            onOpenAccount={(id) => router.push(`/contas?accountId=${encodeURIComponent(id)}`)}
            onAddAccount={() => router.push("/contas")}
          />

          <CreditCardsCard
            cards={creditCards}
            statements={cardStatements}
            transactions={transactions}
            onOpenCard={(id) => router.push(`/cartoes?cardId=${encodeURIComponent(id)}`)}
          />

          <PayablesCard payables={payables} onOpen={() => router.push("/a-pagar")} />

          <CategoryDonutCard
            macros={macros}
            totalExpenses={totalExpenses}
            onAddExpense={() => handleNew("expense")}
          />

          <InsightsCard insights={insights} />
        </div>
      </main>

      <NotificationsSheet
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
  );
}
