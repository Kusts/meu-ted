"use client";

import { Pencil } from "lucide-react";
import {
  AnalyticsFiltersProvider,
  useAnalyticsFilters,
} from "@/components/filters/analytics-filters";
import { FilterPillBar, type FilterAccount } from "@/components/filters/FilterPillBar";
import { CashflowAreaChart, KpiCard, WeeklyHeatmap } from "@/components/charts";
import { formatBRL, formatPct } from "@/lib/format/brl";
import { useAnalytics } from "../../charts-data/useAnalytics";
import { useBlockLayout } from "../../charts-data/useBlockLayout";
import { BlockEmpty, BlockShell, BlockSkeleton, ZoneError } from "../../charts-data/BlockShell";
import { formatDeltaPp, formatDeltaPct, pctChange, trendOf } from "../../charts-data/analytics-format";

const HOME_BLOCKS_KEY = "meu-ted:home-blocks";
const HOME_DEFAULT_ORDER = ["home-kpis", "home-cashflow", "home-heatmap"];

const HOME_TITLES: Record<string, string> = {
  "home-kpis": "Indicadores",
  "home-cashflow": "Fluxo de caixa",
  "home-heatmap": "Atividade semanal",
};

function HomeAnalyticsBlocks({ accounts }: { accounts: FilterAccount[] }) {
  const { filters, setPeriod, setAccountId } = useAnalyticsFilters();
  const bundle = useAnalytics(filters);
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
      return (
        <BlockShell key={id} title={title} testId={`analytics-block-${id}`} {...editProps(id, index)}>
          <div className="grid grid-cols-2 gap-2.5" data-testid="home-kpi-grid">
            <KpiCard
              label="Saldo disponível líquido"
              value={formatBRL(kpis.netLiquidBalanceCents)}
              deltaText={formatDeltaPct(netDelta)}
              trend={trendOf(netDelta)}
            />
            <KpiCard
              label="Faturas abertas no mês"
              value={formatBRL(kpis.openInvoices.committedCents)}
              deltaText={null}
              hint={
                kpis.openInvoices.utilizationPct === null
                  ? undefined
                  : `uso de ${formatPct(kpis.openInvoices.utilizationPct)} do limite`
              }
            />
            <KpiCard
              label="Taxa de poupança"
              value={kpis.savingsRatePct === null ? "—" : formatPct(kpis.savingsRatePct)}
              deltaText={formatDeltaPp(savingsDelta)}
              trend={trendOf(savingsDelta)}
            />
            <KpiCard
              label="Fixo vs discricionário"
              value={formatBRL(kpis.fixedVsDiscretionary.fixedCents)}
              deltaText={null}
              hint={
                kpis.fixedVsDiscretionary.fixedPctOfIncome === null
                  ? `discricionário ${formatBRL(kpis.fixedVsDiscretionary.discretionaryCents)}`
                  : `${formatPct(kpis.fixedVsDiscretionary.fixedPctOfIncome)} da renda é fixo`
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
            />
          )}
        </BlockShell>
      );
    }
    const weeks = (bundle.heatmap?.weeks ?? []).slice(-4);
    return (
      <BlockShell key={id} title={title} testId={`analytics-block-${id}`} {...editProps(id, index)}>
        {weeks.length === 0 ? (
          <BlockEmpty message="Sem atividade no período." hint="Seus gastos por dia aparecem aqui." />
        ) : (
          <WeeklyHeatmap weeks={weeks} formatValue={formatBRL} />
        )}
      </BlockShell>
    );
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
  return (
    <AnalyticsFiltersProvider>
      <HomeAnalyticsBlocks accounts={accounts} />
    </AnalyticsFiltersProvider>
  );
}
