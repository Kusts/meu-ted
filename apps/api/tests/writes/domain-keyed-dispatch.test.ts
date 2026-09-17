/**
 * V4.1 Phase 3 (UOW2) — domain keyed-mutation dispatch (RED).
 *
 * Each domain exposes a `runXMutation(store, claimTx, householdId, op, input)`
 * dispatcher (same shape as writes/keyed-mutations.ts `runTransactionMutation`):
 * - claimTx is an open Postgres claim client  → the store's `*InTx` extension
 *   runs the effect on that client (claim + effect + completion, one commit);
 * - claimTx undefined (no Idempotency-Key, or in-memory store) → the plain
 *   `WriteStore`-style method keeps its own boundary (behavior unchanged);
 * - store without the `*InTx` extension → plain fallback (never throws).
 */
import { describe, expect, it, vi } from 'vitest';
import { runPayableMutation } from '../../src/payables/keyed-mutations.js';
import { runPayableBulkMutation } from '../../src/payables/keyed-mutations.js';
import { runCardMutation } from '../../src/cards/keyed-mutations.js';
import { runGoalMutation } from '../../src/goals/keyed-mutations.js';
import { runBudgetMutation } from '../../src/budgets/keyed-mutations.js';
import { runSubscriptionMutation } from '../../src/subscriptions/keyed-mutations.js';

const fakeTx = { query: async () => ({ rows: [], rowCount: 0 }) };
const HH = '00000000-0000-4000-8000-0000000000a1';

describe('runPayableMutation dispatch', () => {
  it('routes pay/create/update/template ops onto the claim client when InTx exists', async () => {
    const created = { id: 'p1' };
    const store = {
      createPayable: vi.fn(async () => { throw new Error('plain must not run'); }),
      createPayableInTx: vi.fn(async () => created),
      markPayablePaid: vi.fn(async () => { throw new Error('plain must not run'); }),
      markPayablePaidInTx: vi.fn(async () => created),
      updatePayable: vi.fn(async () => { throw new Error('plain must not run'); }),
      updatePayableInTx: vi.fn(async () => created),
      createTemplate: vi.fn(async () => { throw new Error('plain must not run'); }),
      createTemplateInTx: vi.fn(async () => ({ id: 't1' })),
      createPayableFromTemplate: vi.fn(async () => { throw new Error('plain must not run'); }),
      createPayableFromTemplateInTx: vi.fn(async () => created),
      createPayableWithTemplate: vi.fn(async () => { throw new Error('plain must not run'); }),
      createPayableWithTemplateInTx: vi.fn(async () => created),
    };
    const input = { accountId: 'a', description: 'd', amountCents: 100, dueDate: '2026-07-10' };
    await expect(runPayableMutation(store as never, fakeTx, HH, 'create', input as never)).resolves.toBe(created);
    expect(store.createPayableInTx).toHaveBeenCalledWith(fakeTx, HH, input);
    await expect(
      runPayableMutation(store as never, fakeTx, HH, 'pay', { id: 'p1', input: {} }),
    ).resolves.toBe(created);
    expect(store.markPayablePaidInTx).toHaveBeenCalledWith(fakeTx, HH, 'p1', {});
    await expect(
      runPayableMutation(store as never, fakeTx, HH, 'update', { id: 'p1', patch: { description: 'x' } }),
    ).resolves.toBe(created);
    await expect(
      runPayableMutation(store as never, fakeTx, HH, 'createTemplate', { accountId: 'a' } as never),
    ).resolves.toEqual({ id: 't1' });
    await expect(
      runPayableMutation(store as never, fakeTx, HH, 'fromTemplate', { dueDate: '2026-08-10' } as never),
    ).resolves.toBe(created);
    await expect(
      runPayableMutation(store as never, fakeTx, HH, 'createWithTemplate', { payable: input, template: {} } as never),
    ).resolves.toBe(created);
  });

  it('falls back to the plain methods without a claim client, or without InTx', async () => {
    const created = { id: 'p1' };
    const plain = {
      createPayable: vi.fn(async () => created),
      markPayablePaid: vi.fn(async () => created),
    };
    const input = { accountId: 'a', description: 'd', amountCents: 100, dueDate: '2026-07-10' };
    await expect(runPayableMutation(plain as never, undefined, HH, 'create', input as never)).resolves.toBe(created);
    expect(plain.createPayable).toHaveBeenCalledWith(HH, input);
    // Tx client but no InTx extension → plain fallback, never throws.
    await expect(runPayableMutation(plain as never, fakeTx, HH, 'create', input as never)).resolves.toBe(created);
    expect(plain.createPayable).toHaveBeenCalledTimes(2);
  });

  it('routes bulk autoCreate/refresh onto the claim client when InTx exists, else plain', async () => {
    const batch = [{ id: 'p1' }, { id: 'p2' }];
    const store = {
      autoCreateFromTemplates: vi.fn(async () => { throw new Error('plain must not run'); }),
      autoCreateFromTemplatesInTx: vi.fn(async () => batch),
      refreshPayableStatus: vi.fn(async () => { throw new Error('plain must not run'); }),
      refreshPayableStatusInTx: vi.fn(async () => batch),
    };
    await expect(
      runPayableBulkMutation(store as never, fakeTx, HH, 'autoCreate', { daysAhead: 30 }),
    ).resolves.toBe(batch);
    expect(store.autoCreateFromTemplatesInTx).toHaveBeenCalledWith(fakeTx, HH, 30);
    await expect(
      runPayableBulkMutation(store as never, fakeTx, HH, 'refresh', {}),
    ).resolves.toBe(batch);
    expect(store.refreshPayableStatusInTx).toHaveBeenCalledWith(fakeTx, HH);
    // No claim client → plain single-transaction methods.
    const plain = {
      autoCreateFromTemplates: vi.fn(async () => batch),
      refreshPayableStatus: vi.fn(async () => batch),
    };
    await expect(
      runPayableBulkMutation(plain as never, undefined, HH, 'autoCreate', { daysAhead: 7 }),
    ).resolves.toBe(batch);
    expect(plain.autoCreateFromTemplates).toHaveBeenCalledWith(HH, 7);
    await expect(
      runPayableBulkMutation(plain as never, fakeTx, HH, 'refresh', {}),
    ).resolves.toBe(batch);
    expect(plain.refreshPayableStatus).toHaveBeenCalledWith(HH);
  });
});

describe('runCardMutation dispatch', () => {
  it('routes purchase/installments/recurring/pay/cancel onto the claim client', async () => {
    const txs = [{ id: 'tx1' }];
    const store = {
      createCardPurchase: vi.fn(async () => { throw new Error('plain must not run'); }),
      createCardPurchaseInTx: vi.fn(async () => txs),
      createCardInstallments: vi.fn(async () => { throw new Error('plain must not run'); }),
      createCardInstallmentsInTx: vi.fn(async () => txs),
      createRecurringPurchase: vi.fn(async () => { throw new Error('plain must not run'); }),
      createRecurringPurchaseInTx: vi.fn(async () => ({ id: 'r1' })),
      payStatement: vi.fn(async () => { throw new Error('plain must not run'); }),
      payStatementInTx: vi.fn(async () => ({ id: 's1' })),
      cancelPurchase: vi.fn(async () => { throw new Error('plain must not run'); }),
      cancelPurchaseInTx: vi.fn(async () => undefined),
    };
    const purchase = { accountId: 'c', description: 'd', amountCents: 100, date: '2026-06-10' };
    await expect(runCardMutation(store as never, fakeTx, HH, 'purchase', purchase as never)).resolves.toBe(txs);
    expect(store.createCardPurchaseInTx).toHaveBeenCalledWith(fakeTx, HH, purchase);
    await expect(
      runCardMutation(store as never, fakeTx, HH, 'payStatement', { statementId: 's1', input: { amountCents: 100, fromAccountId: 'a' } }),
    ).resolves.toEqual({ id: 's1' });
    await expect(runCardMutation(store as never, fakeTx, HH, 'cancelPurchase', { purchaseId: 'tx1' })).resolves.toBeUndefined();
    expect(store.cancelPurchaseInTx).toHaveBeenCalledWith(fakeTx, HH, 'tx1');
  });

  it('falls back to plain methods without a claim client', async () => {
    const txs = [{ id: 'tx1' }];
    const plain = { createCardPurchase: vi.fn(async () => txs) };
    const purchase = { accountId: 'c', description: 'd', amountCents: 100, date: '2026-06-10' };
    await expect(runCardMutation(plain as never, undefined, HH, 'purchase', purchase as never)).resolves.toBe(txs);
  });
});

describe('runGoalMutation dispatch', () => {
  it('routes create/contribute/update onto the claim client, else plain', async () => {
    const goal = { id: 'g1' };
    const store = {
      createGoal: vi.fn(async () => { throw new Error('plain must not run'); }),
      createGoalInTx: vi.fn(async () => goal),
      contributeToGoal: vi.fn(async () => goal),
      updateGoal: vi.fn(async () => goal),
    };
    const input = { name: 'n', goalType: 'savings', targetAmountCents: 100, startDate: '2026-01-01' };
    await expect(runGoalMutation(store as never, fakeTx, HH, 'create', input as never)).resolves.toBe(goal);
    expect(store.createGoalInTx).toHaveBeenCalledWith(fakeTx, HH, input);
    // No InTx for contribute/update on this spy → plain fallback.
    await expect(runGoalMutation(store as never, fakeTx, HH, 'contribute', { id: 'g1', input: { amountCents: 10 } })).resolves.toBe(goal);
    expect(store.contributeToGoal).toHaveBeenCalledWith(HH, 'g1', { amountCents: 10 });
  });
});

describe('runBudgetMutation dispatch', () => {
  it('routes create/update onto the claim client, else plain', async () => {
    const budget = { id: 'b1' };
    const store = {
      createBudget: vi.fn(async () => budget),
      createBudgetInTx: vi.fn(async () => budget),
      updateBudget: vi.fn(async () => budget),
      updateBudgetInTx: vi.fn(async () => budget),
    };
    const input = { categoryId: 'c', name: 'n', amountCents: 100, period: 'monthly', startDate: '2026-06-01' };
    await expect(runBudgetMutation(store as never, fakeTx, HH, 'create', input as never)).resolves.toBe(budget);
    expect(store.createBudgetInTx).toHaveBeenCalledWith(fakeTx, HH, input);
    await expect(runBudgetMutation(store as never, undefined, HH, 'update', { id: 'b1', patch: {} })).resolves.toBe(budget);
    expect(store.updateBudget).toHaveBeenCalledWith(HH, 'b1', {});
  });
});

describe('runSubscriptionMutation dispatch', () => {
  it('routes create onto the claim client, else plain', async () => {
    const sub = { id: 's1' };
    const store = {
      createSubscription: vi.fn(async () => sub),
      createSubscriptionInTx: vi.fn(async () => sub),
    };
    const input = { name: 'n', amountCents: 100, cycle: 'monthly', day: 5, paymentMethod: 'card' };
    await expect(runSubscriptionMutation(store as never, fakeTx, HH, 'create', input as never)).resolves.toBe(sub);
    expect(store.createSubscriptionInTx).toHaveBeenCalledWith(fakeTx, HH, input);
    await expect(runSubscriptionMutation(store as never, undefined, HH, 'create', input as never)).resolves.toBe(sub);
    expect(store.createSubscription).toHaveBeenCalledWith(HH, input);
  });
});
