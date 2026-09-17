/**
 * Billing-month date arithmetic (V4.1 Task 2.16, SPEC §9.10).
 *
 * Pure, UTC, date-only helpers. Never use `Date.setUTCMonth()` directly for
 * a billing date: it overflows (2026-01-31 + 1 month → 2026-03-03) instead
 * of clamping to the end of the target month (→ 2026-02-28, or 29 in a
 * leap year). All functions operate on `YYYY-MM-DD` strings so results are
 * timezone-independent.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days in a 1-based month (month 1–12). Throws on out-of-range input. */
export const daysInMonth = (year: number, month: number): number => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`invalid year/month: ${year}-${month}`);
  }
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

/**
 * Clamps a 1-based day-of-month to the month length (never raises it).
 * Applies Gregorian century leap rules via {@link daysInMonth}
 * (2000 leap, 1900 not leap).
 */
export const clampDayToMonth = (year: number, month: number, day: number): number => {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`invalid day-of-month: ${day}`);
  }
  return Math.min(day, daysInMonth(year, month));
};

const parseISODate = (iso: string): { year: number; month: number; day: number } => {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`invalid ISO date: ${iso}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`invalid ISO date: ${iso}`);
  }
  return { year, month, day };
};

const formatISODate = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * Adds `months` (negative allowed) to an ISO date, anchoring on the source
 * day and clamping to the target month length: 2026-01-31 + 1 →
 * 2026-02-28; 2024-01-31 + 1 → 2024-02-29; 2026-12-15 + 1 → 2027-01-15.
 */
export const addMonthsSafe = (isoDate: string, months: number): string => {
  if (!Number.isInteger(months)) throw new Error('months must be an integer');
  const { year, month, day } = parseISODate(isoDate);
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total - targetYear * 12 + 1;
  if (targetYear < 1) throw new Error(`resulting year out of range: ${isoDate} + ${months}`);
  return formatISODate(targetYear, targetMonth, clampDayToMonth(targetYear, targetMonth, day));
};

/**
 * Billing dates for `total` parcels starting at `startDate` (parcel 1 =
 * `startDate` itself). Total mirrors the domain installment cap (1–48,
 * same as `splitInstallmentAmounts` and the card routes).
 */
export const installmentDates = (startDate: string, total: number): string[] => {
  if (!Number.isInteger(total) || total < 1 || total > 48) {
    throw new Error('installments must be an integer between 1 and 48');
  }
  // Validates startDate eagerly so a malformed anchor fails fast.
  parseISODate(startDate);
  return Array.from({ length: total }, (_, i) => addMonthsSafe(startDate, i));
};
