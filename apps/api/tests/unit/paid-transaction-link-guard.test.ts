import { describe, expect, it } from 'vitest';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createInMemoryPayableStore } from '../../src/payables/in-memory.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';

/**
 * V4.1 REVIEWFIX F3 [major] — adversarial: editing the payment transaction
 * after pay must not silently corrupt the undo.
 *
 * pay 100 from A → PATCH transaction to 1 on B → unpay would credit 1 to B
 * while A stays debited 100. Chosen fix: BLOCK PATCH and DELETE of
 * transactions linked to a paid payable (409). After unpay clears the link,
 * edits are allowed again.
 */
const seed = () => {
  const { state, writes } = createInMemoryStores({
    accounts: [
      { id: 'acc-a', householdId: HOUSEHOLD_A, name: 'A', kind: 'bank', balanceCents: 10_000, status: 'active' },
      { id: 'acc-b', householdId: HOUSEHOLD_A, name: 'B', kind: 'bank', balanceCents: 0, status: 'active' },
    ],
    categories: [],
    transactions: [],
  });
  const payables = createInMemoryPayableStore(state, () => new Date('2026-06-10T12:00:00Z'));
  return { state, writes, payables };
};

const seedPaid = async () => {
  const ctx = seed();
  const payable = await ctx.payables.createPayable(HOUSEHOLD_A, {
    accountId: 'acc-a', description: 'Conta', amountCents: 10_000, dueDate: '2026-06-15',
  });
  const paid = await ctx.payables.markPayablePaid(HOUSEHOLD_A, payable.id, {});
  return { ...ctx, payableId: payable.id, paidTxId: paid.paidTransactionId! };
};

describe('V4.1 REVIEWFIX F3 — paid-payable link guard on transaction writes', () => {
  it('PATCH of the linked payment transaction → 409 (no silent corruption)', async () => {
    const { writes, paidTxId } = await seedPaid();

    await expect(
      writes.updateTransaction(HOUSEHOLD_A, paidTxId, { amountCents: 1 } as never),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('DELETE of the linked payment transaction → 409', async () => {
    const { writes, paidTxId } = await seedPaid();

    await expect(
      writes.softDeleteTransaction(HOUSEHOLD_A, paidTxId),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('unpay clears the link: payable editable again, tombstone in place', async () => {
    const { writes, payables, payableId, paidTxId, state } = await seedPaid();

    const undone = await payables.undoPayablePayment(HOUSEHOLD_A, payableId, {
      expectedPaidTransactionId: paidTxId,
    });
    expect(undone.paidTransactionId).toBeUndefined();
    expect(state.deletedTransactions.has(paidTxId)).toBe(true);

    // After the undo the payable itself is editable again (200-path).
    const edited = await payables.updatePayable(HOUSEHOLD_A, payableId, { description: 'Conta (revisada)' });
    expect(edited.description).toBe('Conta (revisada)');

    // And an unrelated live transaction stays patchable (guard is link-scoped).
    const other = {
      id: crypto.randomUUID(), householdId: HOUSEHOLD_A, kind: 'expense' as const,
      description: 'Outros', amountCents: 100, date: '2026-06-10', accountId: 'acc-a',
    };
    state.transactions.push(other);
    const updated = await writes.updateTransaction(HOUSEHOLD_A, other.id, { description: 'Outros!' });
    expect(updated.description).toBe('Outros!');
  });

  it('PATCH of an unrelated transaction still works while a payable is paid', async () => {
    const { writes, state } = await seedPaid();
    const other = {
      id: crypto.randomUUID(), householdId: HOUSEHOLD_A, kind: 'expense' as const,
      description: 'Outros', amountCents: 100, date: '2026-06-10', accountId: 'acc-a',
    };
    state.transactions.push(other);

    const updated = await writes.updateTransaction(HOUSEHOLD_A, other.id, { description: 'Outros!' });
    expect(updated.description).toBe('Outros!');
  });
});
