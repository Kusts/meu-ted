/**
 * installment-helpers — Cross-month installment handling
 *
 * An installment of N months starting in month M will have its last installment in M+N-1.
 * If the last installment's statement would close in a year different from the first,
 * it crosses years. This helper calculates all installment periods.
 */

export interface Installment {
  number: number;  // 1 to N
  totalInstallments: number;
  amountCents: number;  // amount of THIS installment (can differ if no interest)
  purchaseDate: string; // YYYY-MM-DD
  statementCycle: string; // YYYY-MM
  closingDate: string;
  dueDate: string;
}

/**
 * Calculate all N installments for a purchase.
 * Each installment has the same amount (assumes no interest).
 *
 * @param purchaseDate Date of first installment (YYYY-MM-DD)
 * @param totalInstallments Total number of installments (1-48)
 * @param totalAmountCents Total amount to be split
 * @param closingDay Day of month the card closes
 * @param dueDay Day of month the bill is due
 * @returns Array of N installments
 */
export function calculateInstallments(
  purchaseDate: string,
  totalInstallments: number,
  totalAmountCents: number,
  closingDay: number,
  dueDay: number
): Installment[] {
  if (totalInstallments < 1 || totalInstallments > 48) {
    throw new Error("totalInstallments deve estar entre 1 e 48");
  }
  if (totalAmountCents <= 0) {
    throw new Error("totalAmountCents deve ser positivo");
  }

  // Split total into N installments, last one absorbs any rounding
  const baseAmount = Math.floor(totalAmountCents / totalInstallments);
  const lastAmount = totalAmountCents - baseAmount * (totalInstallments - 1);

  const installments: Installment[] = [];
  for (let i = 0; i < totalInstallments; i++) {
    // The i-th installment (0-indexed) is in the statement that closes
    // (i+1) months after the first statement.
    // We need to advance the date by i months from the first statement's closing date.
    const firstClosing = computeClosingForPurchase(purchaseDate, closingDay);
    const installmentClosing = addMonths(firstClosing, i);
    const installmentDue = computeDueDate(installmentClosing, dueDay);
    const cycle = installmentClosing.slice(0, 7);

    installments.push({
      number: i + 1,
      totalInstallments,
      amountCents: i === totalInstallments - 1 ? lastAmount : baseAmount,
      purchaseDate: i === 0 ? purchaseDate : installmentClosing,
      statementCycle: cycle,
      closingDate: installmentClosing,
      dueDate: installmentDue,
    });
  }
  return installments;
}

/**
 * Add N months to a YYYY-MM-DD date, preserving day-of-month when possible.
 */
export function addMonths(date: string, months: number): string {
  const d = new Date(date + "T00:00:00.000Z");
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const newDate = new Date(Date.UTC(year, month + months, 1));
  const newYear = newDate.getUTCFullYear();
  const newMonth = newDate.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(newYear, newMonth + 1, 0)).getUTCDate();
  const finalDay = Math.min(day, lastDayOfMonth);
  return `${newYear}-${String(newMonth + 1).padStart(2, "0")}-${String(finalDay).padStart(2, "0")}`;
}

/**
 * Compute closing date for a purchase (separate from getClosingDate
 * in credit-card.ts to avoid circular import).
 */
function computeClosingForPurchase(purchaseDate: string, closingDay: number): string {
  const d = new Date(purchaseDate + "T00:00:00.000Z");
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  let closingYear = year;
  let closingMonth = month;
  if (d.getUTCDate() > closingDay) {
    closingMonth += 1;
    if (closingMonth > 11) {
      closingMonth = 0;
      closingYear += 1;
    }
  }
  const lastDayOfMonth = new Date(Date.UTC(closingYear, closingMonth + 1, 0)).getUTCDate();
  const finalDay = Math.min(closingDay, lastDayOfMonth);
  return `${closingYear}-${String(closingMonth + 1).padStart(2, "0")}-${String(finalDay).padStart(2, "0")}`;
}

/**
 * Compute due date given closing date and due day.
 */
function computeDueDate(closingDate: string, dueDay: number): string {
  const d = new Date(closingDate + "T00:00:00.000Z");
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const closingDay = d.getUTCDate();
  let dueYear = year;
  let dueMonth = month;
  if (dueDay <= closingDay) {
    dueMonth += 1;
    if (dueMonth > 11) {
      dueMonth = 0;
      dueYear += 1;
    }
  }
  const lastDayOfMonth = new Date(Date.UTC(dueYear, dueMonth + 1, 0)).getUTCDate();
  const finalDay = Math.min(dueDay, lastDayOfMonth);
  return `${dueYear}-${String(dueMonth + 1).padStart(2, "0")}-${String(finalDay).padStart(2, "0")}`;
}

/**
 * Check if a sequence of installments crosses year boundary.
 * Returns the years involved.
 */
export function getInstallmentYears(installments: Installment[]): number[] {
  const years = new Set<number>();
  for (const inst of installments) {
    years.add(parseInt(inst.closingDate.slice(0, 4), 10));
  }
  return Array.from(years).sort();
}

/**
 * Format installments for display.
 */
export function formatInstallments(installments: Installment[]): string {
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;
  const years = getInstallmentYears(installments);
  const crossesYear = years.length > 1;
  const lines: string[] = [];
  lines.push(`🔢 ${installments.length}x de ${fmt(installments[0].amountCents)} (total ${fmt(installments.reduce((s, i) => s + i.amountCents, 0))})`);
  if (crossesYear) {
    lines.push(`  ⚠️ Cruza ano: ${years.join(" → ")}`);
  }
  for (const inst of installments) {
    lines.push(`  ${String(inst.number).padStart(2, "0")}/${installments.length} — fatura ${inst.statementCycle} (fecha ${inst.closingDate}, vence ${inst.dueDate}) — ${fmt(inst.amountCents)}`);
  }
  return lines.join("\n");
}
