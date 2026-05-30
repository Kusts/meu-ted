// ─────────────────────────────────────────────────────────────────────────────
// Formatting Utilities for pi-financeiro Dashboard
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

/**
 * Format cents to Brazilian Real (BRL) currency
 * Uses Intl.NumberFormat for proper localization
 */
export function formatCentsToBRL(cents: number): string {
  const value = cents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/**
 * Format ISO date string to Brazilian format (DD/MM/YYYY)
 */
export function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return 'Data inválida';
    }
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return 'Data inválida';
  }
}

/**
 * Format account type to human readable
 */
export function formatAccountType(type: string): string {
  const map: Record<string, string> = {
    checking: 'Conta Corrente',
    savings: 'Poupança',
    cash: 'Dinheiro',
    credit_card: 'Cartão de Crédito',
    investment: 'Investimento',
  };
  return map[type] ?? 'Conta';
}

/**
 * Format financial record type to human readable
 */
export function formatRecordType(type: string): string {
  const map: Record<string, string> = {
    expense: 'Despesa',
    income: 'Receita',
    transfer: 'Transferência',
    interest: 'Juros',
    adjustment: 'Ajuste',
  };
  return map[type] ?? 'Registro';
}

/**
 * Format invoice status to human readable
 */
export function formatInvoiceStatus(status: string): string {
  const map: Record<string, string> = {
    open: 'Aberta',
    closed: 'Fechada',
    paid: 'Paga',
  };
  return map[status] ?? 'Fatura';
}

/**
 * Format month and year to Brazilian period format
 */
export function formatPeriod(month: number, year: number): string {
  if (month < 1 || month > 12) {
    return 'Período inválido';
  }
  return `${MONTHS[month - 1]}/${year}`;
}

/**
 * Format recurrence period to human readable
 */
export function formatRecurrencePeriod(period: string): string {
  const map: Record<string, string> = {
    daily: 'Diário',
    weekly: 'Semanal',
    biweekly: 'Quinzenal',
    monthly: 'Mensal',
    yearly: 'Anual',
  };
  return map[period] ?? 'Recorrência';
}

/**
 * Format record source to human readable
 */
export function formatSource(source: string): string {
  const map: Record<string, string> = {
    dashboard: 'Dashboard',
    whatsapp: 'WhatsApp',
    cron: 'Automático',
    agent: 'TED',
  };
  return map[source] ?? 'Sistema';
}

/**
 * Format percentage (0-100) for display
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format relative time (e.g., "há 2 dias", "em 3 dias")
 */
export function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Amanhã';
    if (diffDays === -1) return 'Ontem';
    if (diffDays > 0) return `Em ${diffDays} dias`;
    return `Há ${Math.abs(diffDays)} dias`;
  } catch {
    return 'Data inválida';
  }
}
