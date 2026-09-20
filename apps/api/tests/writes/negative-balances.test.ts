/**
 * Negative bank/cash balances — user-approved domain rule.
 *
 * New and existing `bank`/`cash` accounts may carry negative balances
 * (including a negative initial balance). `credit_card` accounts keep
 * non-negative outstanding-balance semantics and all card-specific
 * payment/remaining guards.
 *
 * RED-first: every bank-negative behavior below fails before the rule
 * change (400 validation.invalid / 400 schema rejection / drift finding)
 * and passes after. Card guards stay green throughout.
 */
import { describe, expect, it } from 'vitest';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createAccountInputSchema } from '../../src/writes/types.js';
import { createInMemoryPayableStore } from '../../src/payables/in-memory.js';
import { createInMemoryCardStore } from '../../src/cards/in-memory.js';
import { detectAccountsBalanceDrift } from '../../src/scripts/reconciliation/detectors.js';

const H = '00000000-0000-4000-8000-00000000d0b1';

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

describe('negative bank/cash balances — account creation', () => {
  it('schema accepts a negative initial balance for bank/cash', () => {
    expect(
      createAccountInputSchema.safeParse({ name: 'Overdraft', kind: 'bank', initialBalanceCents: -5000 }).success,
    ).toBe(true);
    expect(
      createAccountInputSchema.safeParse({ name: 'Drawer', kind: 'cash', initialBalanceCents: -1 }).success,
    ).toBe(true);
  });

  it('bank account may start negative with the exact stored balance', async () => {
    const { writes, balanceOf } = await setup();
    const acc = await writes.createAccount(H, { name: 'Overdraft', kind: 'bank', initialBalanceCents: -50_00 });
    expect(balanceOf(acc.id)).toBe(-50_00);
  });

  it('cash account may start negative', async () => {
    const { writes, balanceOf } = await setup();
    const acc = await writes.createAccount(H, { name: 'Drawer', kind: 'cash', initialBalanceCents: -1 });
    expect(balanceOf(acc.id)).toBe(-1);
  });

  it('credit_card account may NOT start negative', async () => {
    const { writes } = await setup();
    await expect(
      writes.createAccount(H, { name: 'Card', kind: 'credit_card', initialBalanceCents: -1 }),
    ).rejects.toMatchObject({ code: 'validation.invalid', statusCode: 400 });
  });
});

describe('negative bank/cash balances — debits cross below zero', () => {
  it('expense exceeding the bank balance succeeds with the exact negative delta', async () => {
    const { state, writes, a, catExp, balanceOf } = await setup(20_00);
    const tx = await writes.createExpense(H, {
      description: 'Too big',
      amountCents: 100_00,
      date: '2026-09-01',
      accountId: a.id,
      categoryId: catExp.id,
    });
    expect(tx.amountCents).toBe(100_00);
    expect(balanceOf(a.id)).toBe(20_00 - 100_00);
    expect(state.transactions).toHaveLength(1);
  });

  it('transfer exceeding the source balance succeeds with exact deltas on both sides', async () => {
    const { state, writes, a, b, balanceOf } = await setup(20_00, 50_00);
    await writes.createTransfer(H, {
      description: 'Too big',
      amountCents: 100_00,
      date: '2026-09-01',
      fromAccountId: a.id,
      toAccountId: b.id,
    });
    expect(balanceOf(a.id)).toBe(20_00 - 100_00);
    expect(balanceOf(b.id)).toBe(50_00 + 100_00);
    expect(state.transactions).toHaveLength(1);
  });

  it('payable payment exceeding the balance succeeds with a linked expense and exact negative delta', async () => {
    const { state, a, catExp, balanceOf } = await setup(100_00);
    const payables = createInMemoryPayableStore(state);
    const payable = await payables.createPayable(H, {
      accountId: a.id,
      description: 'Big bill',
      amountCents: 500_00,
      dueDate: '2026-09-05',
      categoryId: catExp.id,
    });
    const paid = await payables.markPayablePaid(H, payable.id, { paidDate: '2026-09-05' });
    expect(paid.status).toBe('paid');
    expect(paid.paidTransactionId).toBeDefined();
    expect(balanceOf(a.id)).toBe(100_00 - 500_00);
  });

  it('statement payment from a thin bank payer succeeds with the exact negative payer delta', async () => {
    const { state, writes, balanceOf } = await setup(100_00);
    const cards = createInMemoryCardStore(state);
    const card = await cards.createCard(H, {
      name: 'Nubank',
      creditLimitCents: 5000_00,
      closingDay: 10,
      dueDay: 20,
    });
    await cards.createCardPurchase(H, {
      accountId: card.id,
      description: 'Book',
      amountCents: 400_00,
      date: '2026-09-03',
    });
    const stmt = (await cards.listStatements(H, card.id))[0]!;
    const payer = state.accounts.find((x) => x.kind === 'bank')!;
    const paid = await cards.payStatement(H, stmt.id, {
      amountCents: 400_00,
      fromAccountId: payer.id,
    });
    expect(paid.paidCents).toBe(400_00);
    expect(balanceOf(payer.id)).toBe(100_00 - 400_00);
    expect(writes).toBeDefined();
  });

  it('deleting an income after it was spent drives the bank balance negative by the exact amount', async () => {
    const { writes, a, catExp, catInc, balanceOf } = await setup(10_00);
    const income = await writes.createIncome(H, {
      description: 'Pay',
      amountCents: 500_00,
      date: '2026-09-01',
      accountId: a.id,
      categoryId: catInc.id,
    });
    await writes.createExpense(H, {
      description: 'All of it',
      amountCents: 510_00,
      date: '2026-09-02',
      accountId: a.id,
      categoryId: catExp.id,
    });
    expect(balanceOf(a.id)).toBe(0);
    await writes.softDeleteTransaction(H, income.id);
    expect(balanceOf(a.id)).toBe(-500_00);
  });

  it('PATCH amount increase beyond the balance succeeds with the exact delta', async () => {
    const { writes, a, catExp, balanceOf } = await setup(1000_00);
    const tx = await writes.createExpense(H, {
      description: 'Lunch',
      amountCents: 200_00,
      date: '2026-09-01',
      accountId: a.id,
      categoryId: catExp.id,
    });
    expect(balanceOf(a.id)).toBe(800_00);
    const updated = await writes.updateTransaction(H, tx.id, { amountCents: 1500_00 });
    expect(updated.amountCents).toBe(1500_00);
    expect(balanceOf(a.id)).toBe(1000_00 - 1500_00);
  });

  it('deleting a transfer whose destination was spent drives the destination negative by the exact amount', async () => {
    const { writes, a, b, catExp, balanceOf } = await setup(100_00, 0);
    const tx = await writes.createTransfer(H, {
      description: 'Seed',
      amountCents: 60_00,
      date: '2026-09-01',
      fromAccountId: a.id,
      toAccountId: b.id,
    });
    await writes.createExpense(H, {
      description: 'Spend it',
      amountCents: 60_00,
      date: '2026-09-02',
      accountId: b.id,
      categoryId: catExp.id,
    });
    await writes.softDeleteTransaction(H, tx.id);
    expect(balanceOf(a.id)).toBe(100_00);
    expect(balanceOf(b.id)).toBe(-60_00);
  });
});

describe('negative balances — credit-card guards stay green', () => {
  it('direct expense on a credit card is still 422', async () => {
    const { state, writes, catExp } = await setup();
    const card = await writes.createAccount(H, { name: 'Card', kind: 'credit_card', initialBalanceCents: 0 });
    await expect(
      writes.createExpense(H, {
        description: 'Nope',
        amountCents: 100,
        date: '2026-09-01',
        accountId: card.id,
        categoryId: catExp.id,
      }),
    ).rejects.toMatchObject({ code: 'validation.invalid', statusCode: 422 });
    expect(state.transactions).toHaveLength(0);
  });

  it('transfer touching a credit card is still 422', async () => {
    const { writes, a } = await setup();
    const card = await writes.createAccount(H, { name: 'Card', kind: 'credit_card', initialBalanceCents: 0 });
    await expect(
      writes.createTransfer(H, {
        description: 'Nope',
        amountCents: 100,
        date: '2026-09-01',
        fromAccountId: a.id,
        toAccountId: card.id,
      }),
    ).rejects.toMatchObject({ code: 'validation.invalid', statusCode: 422 });
  });

  it('moving an expense onto a credit card is still rejected', async () => {
    const { writes, a, catExp, balanceOf } = await setup(1000_00);
    const card = await writes.createAccount(H, { name: 'Card', kind: 'credit_card', initialBalanceCents: 0 });
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
    expect(balanceOf(a.id)).toBe(800_00);
  });

  it('statement overpay (amount > remaining) is still rejected', async () => {
    const { state } = await setup(100000_00);
    const cards = createInMemoryCardStore(state);
    const card = await cards.createCard(H, {
      name: 'Nubank',
      creditLimitCents: 5000_00,
      closingDay: 10,
      dueDay: 20,
    });
    await cards.createCardPurchase(H, {
      accountId: card.id,
      description: 'Book',
      amountCents: 500_00,
      date: '2026-09-03',
    });
    const stmt = (await cards.listStatements(H, card.id))[0]!;
    const payer = state.accounts.find((x) => x.kind === 'bank')!;
    await expect(
      cards.payStatement(H, stmt.id, { amountCents: 600_00, fromAccountId: payer.id }),
    ).rejects.toMatchObject({ code: 'validation.invalid', statusCode: 400 });
  });
});

describe('negative balances — reconciliation keeps delta detection only', () => {
  it('anchored negative balance matching the ledger is NOT drift', () => {
    const result = detectAccountsBalanceDrift([
      {
        accountId: 'a1',
        householdId: 'h1',
        storedCents: -8000,
        initialCents: 2000,
        incomeCents: 0,
        expenseCents: 10000,
        transferInCents: 0,
        transferOutCents: 0,
      },
    ]);
    expect(result.findings).toHaveLength(0);
    expect(result.counts).toEqual({ checked: 1, drifted: 0 });
  });

  it('anchored balance mismatch is still balance_drift even when negative', () => {
    const result = detectAccountsBalanceDrift([
      {
        accountId: 'a1',
        householdId: 'h1',
        storedCents: -7000,
        initialCents: 2000,
        incomeCents: 0,
        expenseCents: 10000,
        transferInCents: 0,
        transferOutCents: 0,
      },
    ]);
    expect(result.counts.drifted).toBe(1);
    expect(result.findings[0]?.kind).toBe('balance_drift');
    expect(result.findings[0]?.expected).toBe(-8000);
    expect(result.findings[0]?.actual).toBe(-7000);
  });

  it('unanchored negative balance is info, not drift', () => {
    const result = detectAccountsBalanceDrift([
      {
        accountId: 'a1',
        householdId: 'h1',
        storedCents: -5,
        initialCents: null,
        incomeCents: 0,
        expenseCents: 5,
        transferInCents: 0,
        transferOutCents: 0,
      },
    ]);
    expect(result.counts).toEqual({ checked: 1, drifted: 0 });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe('info');
  });
});
