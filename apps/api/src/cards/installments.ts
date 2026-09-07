/**
 * Installment amount distribution (L-01 contract).
 *
 * Splits `totalCents` into `n` integer-cent parcels: every parcel gets
 * `floor(total/n)` and the LAST parcel absorbs the remainder, so the parts
 * always sum exactly to the total. Backend stores (postgres, legacy,
 * in-memory) and the PWA preview must all use this single rule — never
 * `Math.round(total/n)` per parcel, which drifts by a cent on values that
 * do not divide evenly (e.g. 1000/3 → 333+333+334, not 333×3).
 */
export const splitInstallmentAmounts = (totalCents: number, n: number): number[] => {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error('totalCents must be a non-negative integer');
  }
  if (!Number.isInteger(n) || n < 1 || n > 48) {
    throw new Error('installments must be an integer between 1 and 48');
  }
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? base + remainder : base));
};
