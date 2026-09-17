/**
 * V4.1 PHASE 4 (Tasks 4.2–4.5, 4.8–4.10) — Canonical D1 hardening, in-memory proofs.
 *
 * D1 (option B, docs/reports/v4.1-decision-gates.md): negative balances are
 * forbidden. No silent clamps: an expense/transfer that exceeds the balance
 * FAILS with 400 validation.invalid (same shape as payables/cards), and the
 * transaction is not recorded. Transaction updates use reverse(before) /
 * apply(after) semantics exactly once.
 *
 * RED: each rejection/mutation test below fails before the fix (silent clamp
 * or double balance restore) and passes after.
 */
import { describe, expect, it } from 'vitest';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createInMemoryPayableStore } from '../../src/payables/in-memory.js';

const H = '00000000-0000-4000-8000-00000000d041';

const setup = async (balanceA = 20_00, balanceB = 50_00) => {
  const { state, writes } = createInMemoryStores();
  const a = await writes.createAccount(H, { name: 'A', kind: 'bank', initialBalanceCents: balanceA });
  const b = await writes.createAccount(H, { name: 'B', kind: 'bank', initialBalanceCents: balanceB });
  const catExp = await writes.createCategory(H, { name: 'Food', kind: 'expense' });
  const catInc = await writes.createCategory(H, { name: 'Salary', kind: 'income' });
  const balanceOf = (id: string): number =>
    state.accounts.find((x) => x.id === id)!.balanceCents;
  return { state, writes, a, b, catExp, catInc, balanceOf };
};

const expectInvalidFunds = async (p: Promise<unknown>): Promise<void> => {
  await expect(p).rejects.toMatchObject({ code: 'validation.invalid', statusCode: 400 });
};

describe('V4.1 Phase 4 — D1 no-negative-balance (in-memory canonical)', () => {
  it('4.2/4.3 expense exceeding balance FAILS 400 and leaves balance and ledger unchanged', async () => {
    const { state, writes, a, catExp, balanceOf } = await setup(20_00);
    await expectInvalidFunds(
      writes.createExpense(H, {
        description: 'Too big',
        amountCents: 100_00,
        date: '2026-09-01',
        accountId: a.id,
        categoryId: catExp.id,
      }),
    );
    expect(balanceOf(a.id)).toBe(20_00);
    expect(state.transactions).toHaveLength(0);
  });

  it('4.2/4.3 transfer exceeding source balance FAILS 400 and changes NEITHER side', async () => {
    const { state, writes, a, b, balanceOf } = await setup(20_00, 50_00);
    await expectInvalidFunds(
      writes.createTransfer(H, {
        description: 'Too big',
        amountCents: 100_00,
        date: '2026-09-01',
        fromAccountId: a.id,
        toAccountId: b.id,
      }),
    );
    expect(balanceOf(a.id)).toBe(20_00);
    expect(balanceOf(b.id)).toBe(50_00);
    expect(state.transactions).toHaveLength(0);
  });

  it('4.2/4.3 exact-balance expense and transfer still succeed (boundary)', async () => {
    const { writes, a, b, catExp, balanceOf } = await setup(20_00, 50_00);
    await writes.createExpense(H, {
      description: 'All of it',
      amountCents: 20_00,
      date: '2026-09-01',
      accountId: b.id,
      categoryId: catExp.id,
    });
    expect(balanceOf(b.id)).toBe(30_00);
    await writes.createTransfer(H, {
      description: 'Move all',
      amountCents: 20_00,
      date: '2026-09-01',
      fromAccountId: a.id,
      toAccountId: b.id,
    });
    expect(balanceOf(a.id)).toBe(0);
    expect(balanceOf(b.id)).toBe(50_00);
  });

  it('4.4/4.5 amount-only increase beyond balance FAILS 400 and restores the old balance', async () => {
    const { writes, a, catExp, balanceOf } = await setup(1000_00);
    const tx = await writes.createExpense(H, {
      description: 'Lunch',
      amountCents: 200_00,
      date: '2026-09-01',
      accountId: a.id,
      categoryId: catExp.id,
    });
    expect(balanceOf(a.id)).toBe(800_00);
    await expectInvalidFunds(writes.updateTransaction(H, tx.id, { amountCents: 1500_00 }));
    expect(balanceOf(a.id)).toBe(800_00);
  });

  it('4.4/4.5 amount-only change applies reverse(before)/apply(after) exactly once', async () => {
    const { writes, a, catExp, balanceOf } = await setup(1000_00);
    const tx = await writes.createExpense(H, {
      description: 'Lunch',
      amountCents: 200_00,
      date: '2026-09-01',
      accountId: a.id,
      categoryId: catExp.id,
    });
    const updated = await writes.updateTransaction(H, tx.id, { amountCents: 300_00 });
    expect(updated.amountCents).toBe(300_00);
    expect(balanceOf(a.id)).toBe(700_00);
  });

  it('4.4/4.5 account-only move reverses the old leg and applies the new leg once', async () => {
    const { writes, a, b, catExp, balanceOf } = await setup(1000_00, 500_00);
    const tx = await writes.createExpense(H, {
      description: 'Lunch',
      amountCents: 200_00,
      date: '2026-09-01',
      accountId: a.id,
      categoryId: catExp.id,
    });
    const updated = await writes.updateTransaction(H, tx.id, { accountId: b.id });
    expect(updated.accountId).toBe(b.id);
    expect(balanceOf(a.id)).toBe(1000_00);
    expect(balanceOf(b.id)).toBe(300_00);
  });

  it('4.4/4.5 combined amount+account change reverses before and applies after exactly once', async () => {
    const { writes, a, b, catExp, balanceOf } = await setup(1000_00, 500_00);
    const tx = await writes.createExpense(H, {
      description: 'Lunch',
      amountCents: 200_00,
      date: '2026-09-01',
      accountId: a.id,
      categoryId: catExp.id,
    });
    const updated = await writes.updateTransaction(H, tx.id, {
      amountCents: 300_00,
      accountId: b.id,
    });
    expect(updated.amountCents).toBe(300_00);
    expect(updated.accountId).toBe(b.id);
    // reverse(before): A back to 1000_00. apply(after): B 500_00 - 300_00.
    expect(balanceOf(a.id)).toBe(1000_00);
    expect(balanceOf(b.id)).toBe(200_00);
  });

  it('4.4/4.5 combined change that exceeds the destination balance FAILS 400 with both sides intact', async () => {
    const { writes, a, b, catExp, balanceOf } = await setup(1000_00, 100_00);
    const tx = await writes.createExpense(H, {
      description: 'Lunch',
      amountCents: 200_00,
      date: '2026-09-01',
      accountId: a.id,
      categoryId: catExp.id,
    });
    await expectInvalidFunds(
      writes.updateTransaction(H, tx.id, { amountCents: 600_00, accountId: b.id }),
    );
    expect(balanceOf(a.id)).toBe(800_00);
    expect(balanceOf(b.id)).toBe(100_00);
  });

  it('4.4/4.5 moving an expense onto a credit card is rejected (H-01 parity with create)', async () => {
    const { state, writes, a, catExp } = await setup(1000_00);
    const card = await writes.createAccount(H, {
      name: 'Card',
      kind: 'credit_card',
      initialBalanceCents: 0,
    });
    const tx = await writes.createExpense(H, {
      description: 'Lunch',
      amountCents: 200_00,
      date: '2026-09-01',
      accountId: a.id,
      categoryId: catExp.id,
    });
    await expect(writes.updateTransaction(H, tx.id, { accountId: card.id })).rejects.toMatchObject({
      code: 'validation.invalid',
    });
    expect(state.accounts.find((x) => x.id === a.id)!.balanceCents).toBe(800_00);
  });

  it('4.4/4.5 income amount change keeps balance == ledger', async () => {
    const { writes, a, catInc, balanceOf } = await setup(1000_00);
    const tx = await writes.createIncome(H, {
      description: 'Pay',
      amountCents: 500_00,
      date: '2026-09-01',
      accountId: a.id,
      categoryId: catInc.id,
    });
    expect(balanceOf(a.id)).toBe(1500_00);
    await writes.updateTransaction(H, tx.id, { amountCents: 200_00 });
    expect(balanceOf(a.id)).toBe(1200_00);
  });

  it('4.8–4.10 pay debits balance and unpay reopens the payable with the exact balance restored', async () => {
    const { state, a, catExp, balanceOf } = await setup(1000_00);
    const payables = createInMemoryPayableStore(state);
    const payable = await payables.createPayable(H, {
      accountId: a.id,
      description: 'Rent',
      amountCents: 400_00,
      dueDate: '2026-09-05',
      categoryId: catExp.id,
    });
    const paid = await payables.markPayablePaid(H, payable.id, { paidDate: '2026-09-05' });
    expect(paid.status).toBe('paid');
    expect(paid.paidTransactionId).toBeDefined();
    // NB: `paid` is the live stored object — capture the link before undo
    // clears it in place.
    const paidTxId = paid.paidTransactionId!;
    expect(balanceOf(a.id)).toBe(600_00);
    const undone = await payables.undoPayablePayment(H, payable.id, {
      expectedPaidTransactionId: paidTxId,
    });
    expect(['pending', 'overdue']).toContain(undone.status);
    expect(undone.paidTransactionId).toBeUndefined();
    expect(balanceOf(a.id)).toBe(1000_00);
    // The linked expense is tombstoned, so the ledger no longer counts it.
    expect(state.deletedTransactions.has(paidTxId)).toBe(true);
  });

  it('4.8 payable payment beyond balance FAILS 400 (same shape as payStatement)', async () => {
    const { state, a, catExp, balanceOf } = await setup(100_00);
    const payables = createInMemoryPayableStore(state);
    const payable = await payables.createPayable(H, {
      accountId: a.id,
      description: 'Big bill',
      amountCents: 500_00,
      dueDate: '2026-09-05',
      categoryId: catExp.id,
    });
    await expectInvalidFunds(payables.markPayablePaid(H, payable.id, { paidDate: '2026-09-05' }));
    expect(balanceOf(a.id)).toBe(100_00);
  });
});
