/**
 * Installment amount distribution (L-01 contract, PWA mirror).
 *
 * MUST match apps/api/src/cards/installments.ts exactly: every parcel gets
 * floor(total/n) and the LAST parcel absorbs the remainder, so parts always
 * sum to the total. The two implementations are pinned by identical test
 * vectors in installments.test.ts on each side (they cannot share a package:
 * the API ships to Node/VPS, the PWA to the browser bundle).
 */
export function splitInstallmentAmounts(totalCents: number, n: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error("totalCents must be a non-negative integer");
  }
  if (!Number.isInteger(n) || n < 1 || n > 48) {
    throw new Error("installments must be an integer between 1 and 48");
  }
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? base + remainder : base));
}
