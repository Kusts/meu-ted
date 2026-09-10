"use client";

import { CreditCard, Pencil, PiggyBank, Scale, WalletCards } from "lucide-react";
import {
  AnalyticsFiltersProvider,
  useAnalyticsFilters,
} from "@/components/filters/analytics-filters";
import { useWorkspaceSafe } from "@/lib/auth/workspace-context";
import { FilterPillBar, type FilterAccount } from "@/components/filters/FilterPillBar";
import { CashflowAreaChart, KpiCard } from "@/components/charts";
import { formatBRL, formatPct } from "@/lib/format/brl";
import { useAnalytics } from "../../charts-data/useAnalytics";
import { useBlockLayout } from "../../charts-data/useBlockLayout";
import { BlockEmpty, BlockShell, BlockSkeleton, ZoneError } from "../../charts-data/BlockShell";
import { formatDeltaPp, formatDeltaPct, pctChange, trendOf } from "../../charts-data/analytics-format";

const HOME_BLOCKS_KEY = "meu-ted:home-blocks";
const HOME_DEFAULT_ORDER = ["home-kpis", "home-cashflow"];

const HOME_TITLES: Record<string, string> = {
  "home-kpis": "Indicadores",
  "home-cashflow": "Fluxo de caixa",
};

function HomeAnalyticsBlocks({ accounts }: { accounts: FilterAccount[] }) {
  const { filters, setPeriod, setAccountId } = useAnalyticsFilters();
  // Home não exibe heatmap: pula o request de daily-heatmap.
  const bundle = useAnalytics(filters, { includeHeatmap: false });
  const layout = useBlockLayout(HOME_BLOCKS_KEY, HOME_DEFAULT_ORDER);
  const { visible, editing, setEditing } = layout;

  const editProps = (id: string, index: number) => ({
    editMode: editing,
    hidden: layout.layout.hidden.includes(id),
    disableUp: index === 0,
    disableDown: index === layout.layout.order.length - 1,
    onToggleHidden: () => layout.toggle(id),
    onMoveUp: () => layout.move(id, -1),
    onMoveDown: () => layout.move(id, 1),
  });

  const renderBlock = (id: string, index: number) => {
    const title = HOME_TITLES[id] ?? id;
    if (bundle.loading) {
      return (
        <BlockShell key={id} title={title} testId={`analytics-block-${id}`} {...editProps(id, index)}>
          <BlockSkeleton />
        </BlockShell>
      );
    }
    if (id === "home-kpis") {
      const kpis = bundle.kpis;
      if (!kpis) {
        return (
          <BlockShell key={id} title={title} testId={`analytics-block-${id}`} {...editProps(id, index)}>
            <BlockEmpty message="Sem indicadores no período." hint="Registre lançamentos para ver seus números aqui." />
          </BlockShell>
        );
      }
      const net = kpis.incomeCents - kpis.expenseCents;
      const prevNet = kpis.previousIncomeCents - kpis.previousExpenseCents;
      const netDelta = pctChange(net, prevNet);
      const savingsDelta =
        kpis.savingsRatePct === null || kpis.previousSavingsRatePct === null
          ? null
          : kpis.savingsRatePct - kpis.previousSavingsRatePct;
      const invoiceUtilizationPct = kpis.openInvoices.utilizationPct;
      const fixedPctOfIncome = kpis.fixedVsDiscretionary.fixedPctOfIncome;
      return (
        <BlockShell key={id} title={title} testId={`analytics-block-${id}`} {...editProps(id, index)}>
          <div className="grid grid-cols-2 gap-2.5" data-testid="home-kpi-grid">
            <KpiCard
              label="Saldo disponível líquido"
              value={formatBRL(kpis.netLiquidBalanceCents)}
              deltaText={formatDeltaPct(netDelta)}
              trend={trendOf(netDelta)}
              icon={<WalletCards size={14} aria-hidden="true" />}
            />
            <KpiCard
              label="Faturas em aberto"
              value={formatBRL(kpis.openInvoices.committedCents)}
              deltaText={null}
              icon={<CreditCard size={14} aria-hidden="true" />}
              hint={
                invoiceUtilizationPct === null
                  ? "Limite não informado"
                  : `uso de ${formatPct(invoiceUtilizationPct)} do limite`
              }
              progress={
                invoiceUtilizationPct === null
                  ? null
                  : {
                      valuePct: invoiceUtilizationPct,
                      label: `Utilização do limite: ${formatPct(invoiceUtilizationPct)}`,
                    }
              }
            />
            <KpiCard
              label="Taxa de poupança"
              value={kpis.savingsRatePct === null ? "—" : formatPct(kpis.savingsRatePct)}
              deltaText={formatDeltaPp(savingsDelta)}
              trend={trendOf(savingsDelta)}
              icon={<PiggyBank size={14} aria-hidden="true" />}
              hint={kpis.savingsRatePct === null ? "Sem renda no período" : undefined}
            />
            <KpiCard
              label="Fixo vs discricionário"
              value={formatBRL(kpis.fixedVsDiscretionary.fixedCents)}
              deltaText={null}
              icon={<Scale size={14} aria-hidden="true" />}
              hint={
                fixedPctOfIncome === null
                  ? "Sem renda no período"
                  : `${formatPct(fixedPctOfIncome)} da renda é fixo`
              }
              progress={
                fixedPctOfIncome === null
                  ? null
                  : {
                      valuePct: fixedPctOfIncome,
                      label: `Fixos representam ${formatPct(fixedPctOfIncome)} da renda`,
                    }
              }
            />
          </div>
        </BlockShell>
      );
    }
    if (id === "home-cashflow") {
      const series = bundle.cashflow;
      const empty = !series || series.current.length === 0;
      return (
        <BlockShell key={id} title={title} testId={`analytics-block-${id}`} {...editProps(id, index)}>
          {empty ? (
            <BlockEmpty message="Sem movimentação no período." hint="Registre lançamentos para ver o fluxo aqui." />
          ) : (
            <CashflowAreaChart
              current={series.current}
              previous={series.previous}
              formatValue={formatBRL}
              availableBalanceCents={bundle.kpis?.netLiquidBalanceCents}
              summaryLabel="Saldo disponível líquido"
            />
          )}
        </BlockShell>
      );
    }
    // Ids legados (ex.: home-heatmap de layouts salvos) são ignorados:
    // o clamp do useBlockLayout já os filtra do schema atual.
    return null;
  };

  return (
    <div className="flex flex-col gap-3.5" data-testid="home-analytics-zone">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <FilterPillBar
            filters={filters}
            accounts={accounts}
            onPeriodChange={setPeriod}
            onAccountChange={setAccountId}
          />
        </div>
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          aria-pressed={editing}
          aria-label="Editar blocos"
          title="Editar blocos"
          className={`mt-3 flex-none rounded-full border p-2.5 shadow-sm transition-all active:scale-[0.98] ${
            editing
              ? "border-primary bg-primary-tint text-primary"
              : "border-border-subtle bg-surface-1 text-text-muted"
          }`}
        >
          <Pencil size={14} />
        </button>
      </div>
      {bundle.error && !bundle.loading ? (
        <ZoneError message="Não foi possível carregar os gráficos." onRetry={bundle.reload} />
      ) : (
        (editing ? layout.layout.order : visible).map((id, index) => renderBlock(id, index))
      )}
    </div>
  );
}

export function HomeAnalyticsZone({ accounts }: { accounts: FilterAccount[] }) {
  // H-11: filters persist per canonical workspace, never globally.
  const workspaceId = useWorkspaceSafe()?.activeWorkspace?.id ?? null;
  return (
    <AnalyticsFiltersProvider workspaceId={workspaceId}>
      <HomeAnalyticsBlocks accounts={accounts} />
    </AnalyticsFiltersProvider>
  );
}
