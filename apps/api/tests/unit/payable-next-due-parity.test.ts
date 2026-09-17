import { describe, expect, it } from 'vitest';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createInMemoryPayableStore } from '../../src/payables/in-memory.js';
import { addMonthsSafe } from '../../src/shared/billing-month.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';

/**
 * V4.1 REVIEWFIX F10 (follow-up) — month-end overflow in payable recurrence.
 *
 * Canonical + in-memory getNextDue used raw setUTCMonth (Jan 31 → Mar 3)
 * while legacy clamps (Jan 31 → Feb 28). All three must use the clamped
 * addMonthsSafe semantics.
 */
const seed = () => {
  const { state } = createInMemoryStores({
    accounts: [
      { id: 'acc-a', householdId: HOUSEHOLD_A, name: 'A', kind: 'bank', balanceCents: 1_000_000, status: 'active' },
    ],
    categories: [],
    transactions: [],
  });
  const payables = createInMemoryPayableStore(state, () => new Date('2026-01-15T12:00:00Z'));
  return { state, payables };
};

describe('V4.1 REVIEWFIX F10 — clamped month arithmetic in getNextDue', () => {
  it('addMonthsSafe clamps month-end (contract anchor)', () => {
    expect(addMonthsSafe('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsSafe('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsSafe('2026-01-31', 3)).toBe('2026-04-30');
    expect(addMonthsSafe('2026-01-30', 1)).toBe('2026-02-28');
    expect(addMonthsSafe('2026-01-15', 1)).toBe('2026-02-15');
  });

  it.each([
    { dueDate: '2026-01-31', expected: '2026-02-28' },
    { dueDate: '2026-01-30', expected: '2026-02-28' },
    { dueDate: '2026-01-29', expected: '2026-02-28' },
    { dueDate: '2026-03-31', expected: '2026-04-30' },
  ])('in-memory recurring pay on $dueDate creates successor $expected', async ({ dueDate, expected }) => {
    const { payables } = seed();
    const payable = await payables.createPayable(HOUSEHOLD_A, {
      accountId: 'acc-a', description: 'Mensalidade', amountCents: 1_000,
      dueDate, type: 'recurring', frequency: 'monthly',
    });
    await payables.markPayablePaid(HOUSEHOLD_A, payable.id, {});
    const pending = await payables.listPayables(HOUSEHOLD_A, { status: 'pending' });
    const successors = pending.filter((p) => p.id !== payable.id);
    expect(successors).toHaveLength(1);
    expect(successors[0]!.dueDate).toBe(expected);
  });
});
