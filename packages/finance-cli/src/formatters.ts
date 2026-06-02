// ─────────────────────────────────────────────────────────────────────────────
// Formatters - TED Finance CLI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format cents to BRL currency string
 */
export function formatCurrency(cents: number): string {
  const reais = cents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(reais);
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: Date | string): string {
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  return date.toISOString().split('T')[0];
}

/**
 * Parse currency string to cents
 */
export function parseCurrencyToCents(value: string): number {
  const cleaned = value.replace(/[R$\s.,]/g, '').replace(',', '.');
  return Math.round(parseFloat(cleaned) * 100);
}

/**
 * Format API response for CLI output
 */
export function formatRecordSummary(record: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`  ID: ${record.id}`);
  if (record.amountCents) {
    lines.push(`  Valor: ${formatCurrency(record.amountCents as number)}`);
  }
  if (record.description) {
    lines.push(`  Descrição: ${record.description}`);
  }
  if (record.date) {
    lines.push(`  Data: ${formatDate(record.date as string)}`);
  }
  if (record.type) {
    lines.push(`  Tipo: ${record.type}`);
  }
  if (record.status) {
    lines.push(`  Status: ${record.status}`);
  }
  return lines.join('\n');
}