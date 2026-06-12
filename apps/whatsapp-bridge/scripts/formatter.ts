// ─────────────────────────────────────────────────────────────────────────────
// Weekly summary formatter — pure function, no side effects
// Input: WeeklyData + week label
// Output: WhatsApp message string
// ─────────────────────────────────────────────────────────────────────────────

import type { WeeklyData } from './data-provider.js';

const _dirs = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const localeDateString = (d: string) => _dirs.format(new Date(d + 'T12:00:00'));

function fmtCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const centavos = abs % 100;
  const formatted = `R$ ${reais.toLocaleString('pt-BR')},${centavos.toString().padStart(2, '0')}`;
  return negative ? `-${formatted}` : formatted;
}

function txLine(tx: { date: string; kind: string; amount_cents: number; description: string | null; from_account_name: string | null; to_account_name: string | null }): string {
  const date = tx.date ? localeDateString(tx.date) : '?';
  const desc = tx.description ? ` — ${tx.description}` : '';
  const amount = fmtCents(tx.amount_cents);
  const account = tx.kind === 'income'
    ? (tx.to_account_name ?? '')
    : tx.kind === 'transfer'
    ? `${tx.from_account_name ?? ''} → ${tx.to_account_name ?? ''}`
    : (tx.from_account_name ?? '');

  const kindLabel: Record<string, string> = {
    expense: 'despesa',
    income: 'receita',
    transfer: 'transferência',
  };

  return ` • ${date} — ${kindLabel[tx.kind] ?? tx.kind}: ${amount}${desc}${account ? ` ← ${account}` : ''}`;
}

function installmentLine(item: { planDescription: string; installmentLabel: string; amountCents: number; dueDate: string; daysUntil: number; accountName: string }): string {
  const when = item.daysUntil < 0
    ? `venceu há ${Math.abs(item.daysUntil)} dia(s)`
    : item.daysUntil === 0
      ? 'vence hoje'
      : `vence em ${item.daysUntil} dia(s)`;
  return ` • ${item.planDescription} (${item.installmentLabel}): ${fmtCents(item.amountCents)} — ${when} (${localeDateString(item.dueDate)}) ← ${item.accountName}`;
}

export function formatWeeklySummary(
  data: WeeklyData,
  weekLabel: string
): string {
  const { accounts, weekTransactions, currentMonthSummary, dueInstallments = [] } = data;

  // Accounts block
  const accountLines = accounts.length === 0
    ? ' Nenhuma conta cadastrada'
    : accounts.map(a => ` • ${a.name}: ${fmtCents(a.balance_cents)}`).join('\n');

  // Transactions block
  const txCount = weekTransactions.length;
  const txHeader = `📋 Esta ${weekLabel} (${txCount} transação${txCount !== 1 ? 'ões' : ''}):`;
  const txLines = weekTransactions.length === 0
    ? ' Nenhuma transação esta semana'
    : weekTransactions.slice(0, 5).map(txLine).join('\n');

  // Installment reminders
  const installmentBlock = dueInstallments.length === 0
    ? '✅ Nenhum parcelamento fora do cartão vencendo no período'
    : dueInstallments.slice(0, 10).map(installmentLine).join('\n');

  // Month context
  const month = currentMonthSummary;
  const monthLabel = month.month ?? '';
  const monthBlock = month.transaction_count > 0
    ? `💰 ${monthLabel} até agora:\n • receitas: ${fmtCents(month.total_income_cents)}\n • despesas: ${fmtCents(month.total_expense_cents)}\n • saldo: ${fmtCents(month.net_balance_cents)}`
    : '';

  return [
    `📊 Resumo Semanal — ${weekLabel}`,
    '',
    '🏦 Contas:',
    accountLines,
    '',
    txHeader,
    txLines,
    '',
    `🚗 Parcelamentos fora do cartão vencendo:`,
    installmentBlock,
    monthBlock ? '' : null,
    monthBlock,
  ].filter(line => line !== null).join('\n');
}
