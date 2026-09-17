/**
 * Shared money validation (V4.1 Phase 8, task 8.9, SPEC §15.9).
 *
 * Amounts are integer cents and must satisfy:
 * - integer (rejects NaN/±Infinity/floats — `.int()` + `.finite()`);
 * - `Number.isSafeInteger` (implied: every integer within ±MAX is safe);
 * - `|value| <= MAX_MONEY_CENTS` (domain max: 10^12 cents = R$10bi —
 *   aborts absurd magnitudes before they reach the ledger).
 *
 * Built only from native `ZodNumber` checks (no `.refine()` wrappers) so
 * the serialized JSON-schema contract keeps `type: integer` with
 * `minimum`/`maximum` (see `agent-tools-authoritative-all`).
 */

import { z } from 'zod';

/** Domain max for cent amounts: 10^12 (R$ 10 bilhões). */
export const MAX_MONEY_CENTS = 1_000_000_000_000;

/** Any ledger-safe cent amount (sign unrestricted — callers add sign rules). */
export const moneyCentsSchema = z
  .number()
  .finite('valor deve ser um número finito')
  .int('valor deve ser um inteiro (centavos)')
  .min(-MAX_MONEY_CENTS, `valor excede o máximo permitido (${MAX_MONEY_CENTS} centavos)`)
  .max(MAX_MONEY_CENTS, `valor excede o máximo permitido (${MAX_MONEY_CENTS} centavos)`);

/** Strictly positive amounts (charges, purchases, contributions, budgets). */
export const positiveMoneyCentsSchema = z
  .number()
  .finite('valor deve ser um número finito')
  .int('valor deve ser um inteiro (centavos)')
  .positive('valor deve ser maior que zero')
  .max(MAX_MONEY_CENTS, `valor excede o máximo permitido (${MAX_MONEY_CENTS} centavos)`);

/** Zero-or-positive amounts (balances, initial values). */
export const nonNegativeMoneyCentsSchema = z
  .number()
  .finite('valor deve ser um número finito')
  .int('valor deve ser um inteiro (centavos)')
  .nonnegative('valor não pode ser negativo')
  .max(MAX_MONEY_CENTS, `valor excede o máximo permitido (${MAX_MONEY_CENTS} centavos)`);
