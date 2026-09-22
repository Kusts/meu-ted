import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

const auth = () => ({ 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() });

const seedPayable = async (
  app: ReturnType<typeof buildTestApp>['app'],
  opts: { balance?: number; amount?: number; type?: 'one_time' | 'recurring'; frequency?: 'monthly' } = {},
) => {
  const account = await app.inject({
    method: 'POST', url: '/accounts', headers: auth(),
    payload: { name: 'Pay Double', kind: 'bank', initialBalanceCents: opts.balance ?? 50_000 },
  });
  const category = await app.inject({
    method: 'POST', url: '/categories', headers: auth(),
    payload: { name: 'Bills', kind: 'expense' },
  });
  const payable = await app.inject({
    method: 'POST', url: '/payables', headers: auth(),
    payload: {
      accountId: account.json().id,
      description: 'Luz',
      amountCents: opts.amount ?? 10_000,
      dueDate: '2026-06-15',
      ...(opts.type ? { type: opts.type } : {}),
      ...(opts.frequency ? { frequency: opts.frequency } : {}),
      categoryId: category.json().id,
    },
  });
  return { accountId: account.json().id as string, payableId: payable.json().id as string };
};

describe('V4.1 Task 2.x — payable double-pay is a single financial effect', () => {
  it('concurrent double-pay yields exactly 1 success + 1 conflict and a single debit', async () => {
    const { app, state } = buildTestApp();
    const { payableId, accountId } = await seedPayable(app);
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/payables/${payableId}/pay`, headers: { ...auth(), 'idempotency-key': `dd-${crypto.randomUUID()}` }, payload: { paidDate: '2026-06-14' } }),
      app.inject({ method: 'POST', url: `/payables/${payableId}/pay`, headers: { ...auth(), 'idempotency-key': `dd-${crypto.randomUUID()}` }, payload: { paidDate: '2026-06-14' } }),
    ]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    const effects = state.transactions.filter((t) => t.kind === 'expense' && t.amountCents === 10_000);
    expect(effects).toHaveLength(1);
    const acc = state.accounts.find((x) => x.id === accountId);
    expect(acc?.balanceCents).toBe(40_000);
    const winner = a.statusCode === 200 ? a : b;
    expect(typeof winner.json().paidTransactionId).toBe('string');
    expect(winner.json().paidTransactionId).toBe(effects[0]!.id);
  });

  it('pay always creates the expense transaction (D3: no opt-out)', async () => {
    const { app, state } = buildTestApp();
    const { payableId } = await seedPayable(app);
    const pay = await app.inject({
      method: 'POST', url: `/payables/${payableId}/pay`, headers: auth(), payload: { paidDate: '2026-06-14' },
    });
    expect(pay.statusCode).toBe(200);
    expect(typeof pay.json().paidTransactionId).toBe('string');
    const tx = state.transactions.find((t) => t.id === pay.json().paidTransactionId);
    expect(tx?.kind).toBe('expense');
    expect(tx?.amountCents).toBe(10_000);
  });

  it('rejects the createTransaction escape hatch (D3)', async () => {
    const { app } = buildTestApp();
    const { payableId } = await seedPayable(app);
    const pay = await app.inject({
      method: 'POST', url: `/payables/${payableId}/pay`, headers: auth(),
      payload: { paidDate: '2026-06-14', createTransaction: false },
    });
    expect(pay.statusCode).toBe(400);
  });

  it('pays with amount above the balance and records the exact negative delta (negative-balance rule)', async () => {
    const { app, state } = buildTestApp();
    const { payableId, accountId } = await seedPayable(app, { balance: 5_000, amount: 10_000 });
    const pay = await app.inject({
      method: 'POST', url: `/payables/${payableId}/pay`, headers: auth(), payload: { paidDate: '2026-06-14' },
    });
    expect(pay.statusCode).toBe(200);
    expect(typeof pay.json().paidTransactionId).toBe('string');
    const listed = await app.inject({ method: 'GET', url: '/payables?status=paid', headers: auth() });
    expect(listed.json().items).toHaveLength(1);
    expect(state.transactions.filter((t) => t.amountCents === 10_000)).toHaveLength(1);
    expect(state.accounts.find((x) => x.id === accountId)?.balanceCents).toBe(5_000 - 10_000);
  });

  it('unpay keeps the recurring successor, reverses the debit and requires the linked paidTransactionId (D4)', async () => {
    const { app, state } = buildTestApp({}, () => new Date('2026-06-10T12:00:00Z'));
    const account = await app.inject({
      method: 'POST', url: '/accounts', headers: auth(),
      payload: { name: 'Pay Double', kind: 'bank', initialBalanceCents: 50_000 },
    });
    const category = await app.inject({
      method: 'POST', url: '/categories', headers: auth(),
      payload: { name: 'Bills', kind: 'expense' },
    });
    const created = await app.inject({
      method: 'POST', url: '/payables', headers: auth(),
      payload: {
        accountId: account.json().id, description: 'Luz', amountCents: 10_000,
        dueDate: '2026-06-15', type: 'recurring', frequency: 'monthly', categoryId: category.json().id,
      },
    });
    const payableId = created.json().id as string;
    const accountId = account.json().id as string;
    const pay = await app.inject({
      method: 'POST', url: `/payables/${payableId}/pay`, headers: auth(), payload: { paidDate: '2026-06-14' },
    });
    expect(pay.statusCode).toBe(200);
    const paidTxId = pay.json().paidTransactionId as string;
    expect(typeof paidTxId).toBe('string');
    const successorBefore = (await app.inject({ method: 'GET', url: '/payables?status=pending', headers: auth() })).json().items;
    expect(successorBefore).toHaveLength(1);

    const wrong = await app.inject({
      method: 'POST', url: `/payables/${payableId}/unpay`, headers: auth(),
      payload: { paidTransactionId: crypto.randomUUID() },
    });
    expect(wrong.statusCode).toBe(409);

    const unpay = await app.inject({
      method: 'POST', url: `/payables/${payableId}/unpay`, headers: auth(),
      payload: { paidTransactionId: paidTxId },
    });
    expect(unpay.statusCode).toBe(200);
    expect(['pending', 'overdue']).toContain(unpay.json().status);
    // Successor survives the undo (D4).
    const after = (await app.inject({ method: 'GET', url: '/payables', headers: auth() })).json().items as Array<{ id: string; status: string }>;
    expect(after.filter((p) => p.status !== 'paid' && p.status !== 'cancelled')).toHaveLength(2);
    // Linked transaction is reversed and the debit is restored.
    expect(state.deletedTransactions.has(paidTxId)).toBe(true);
    expect(state.accounts.find((x) => x.id === accountId)?.balanceCents).toBe(50_000);
  });
});
