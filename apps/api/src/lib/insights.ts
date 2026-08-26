import type { DashboardSummary, QuickInsight } from '../types/domain.js';

const fmtBRL = (cents: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);

/**
 * Generate up to 5 short, friendly PT-BR insights for the home screen.
 * Pure function over dashboard summary — easy to test and stable to swap
 * for an LLM call later.
 */
export { computePaymentScore, parsePeriodQuery } from '../insights/payment-score.js';

export const buildQuickInsights = (summary: DashboardSummary): QuickInsight[] => {
  const insights: QuickInsight[] = [];

  if (summary.monthNetCents > 0) {
    insights.push({
      id: 'positive-net',
      title: 'Mês no azul',
      body: `Você economizou ${fmtBRL(summary.monthNetCents)} até agora neste mês.`,
      severity: 'good',
    });
  } else if (summary.monthNetCents < 0) {
    insights.push({
      id: 'negative-net',
      title: 'Atenção ao mês',
      body: `Despesas superam receitas em ${fmtBRL(Math.abs(summary.monthNetCents))}.`,
      severity: 'warn',
    });
  } else {
    insights.push({
      id: 'even-net',
      title: 'Mês equilibrado',
      body: 'Receitas e despesas estão empatadas até o momento.',
      severity: 'info',
    });
  }

  if (summary.topExpenses.length > 0) {
    const top = summary.topExpenses[0]!;
    insights.push({
      id: 'top-expense',
      title: 'Maior despesa recente',
      body: `${top.description} · ${fmtBRL(top.amountCents)} em ${top.date}.`,
      severity: 'info',
    });
  }

  if (summary.cashFlowLast30DaysCents < 0) {
    insights.push({
      id: 'cashflow-burn',
      title: 'Queima de caixa',
      body: `Caixa caiu ${fmtBRL(Math.abs(summary.cashFlowLast30DaysCents))} nos últimos 30 dias.`,
      severity: 'warn',
    });
  } else if (summary.cashFlowLast30DaysCents > 0) {
    insights.push({
      id: 'cashflow-grow',
      title: 'Caixa crescendo',
      body: `Caixa subiu ${fmtBRL(summary.cashFlowLast30DaysCents)} nos últimos 30 dias.`,
      severity: 'good',
    });
  }

  if (summary.totalBalanceCents === 0) {
    insights.push({
      id: 'no-balance',
      title: 'Cadastre sua primeira conta',
      body: 'Sem contas ativas, o saldo total aparece zerado.',
      severity: 'info',
    });
  }

  return insights.slice(0, 5);
};
