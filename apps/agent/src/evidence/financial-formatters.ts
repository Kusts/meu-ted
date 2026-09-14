export const sumCents = (values: readonly number[]): number => values.reduce((total, value) => total + Math.trunc(value), 0);

export const formatCents = (cents: number, locale = 'pt-BR'): string =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(cents / 100);

export const renderTransactionsTotal = (amountsCents: readonly number[]): string => `Total: ${formatCents(sumCents(amountsCents))}`;
