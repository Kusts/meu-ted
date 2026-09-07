/**
 * C-04 (route level): cascading a category must reverse account balances.
 *
 * Creates an account (10_000), posts an expense (1000) and an income (500),
 * cascades the expense category and asserts GET /accounts shows the balance
 * with the cascaded expense reversed (10_500), not stuck at 9_500.
 */
import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

const H = { 'x-device-token': TOKEN_A, 'content-type': 'application/json' };

const getBalance = async (app: ReturnType<typeof buildTestApp>['app'], id: string): Promise<number> => {
  const res = await app.inject({ method: 'GET', url: '/accounts', headers: { 'x-device-token': TOKEN_A } });
  const item = res.json().items.find((a: { id: string }) => a.id === id);
  return item.balanceCents as number;
};

describe('C-04 category cascade reverses balances (route)', () => {
  it('cascade restores the debited balance', async () => {
    const { app } = buildTestApp();
    const acc = await app.inject({
      method: 'POST', url: '/accounts', headers: H,
      payload: { name: 'A', kind: 'bank', initialBalanceCents: 10_000 },
    });
    const accountId = acc.json().id as string;
    const cat = await app.inject({
      method: 'POST', url: '/categories', headers: H,
      payload: { name: 'Food', kind: 'expense' },
    });
    const categoryId = cat.json().id as string;
    const catInc = await app.inject({
      method: 'POST', url: '/categories', headers: H,
      payload: { name: 'Salary', kind: 'income' },
    });
    await app.inject({
      method: 'POST', url: '/transactions/expense', headers: H,
      payload: { description: 'Lunch', amountCents: 1000, date: '2026-06-10', accountId, categoryId },
    });
    await app.inject({
      method: 'POST', url: '/transactions/income', headers: H,
      payload: { description: 'Pay', amountCents: 500, date: '2026-06-10', accountId, categoryId: catInc.json().id },
    });
    expect(await getBalance(app, accountId)).toBe(9500);

    const del = await app.inject({
      method: 'POST', url: `/categories/${categoryId}/delete`, headers: H,
      payload: { mode: 'cascade', confirm: true },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toMatchObject({ softDeletedTransactions: 1 });
    expect(await getBalance(app, accountId)).toBe(10_500);
  });
});
