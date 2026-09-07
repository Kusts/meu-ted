import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

const H = { 'x-device-token': TOKEN_A, 'content-type': 'application/json' };
const CLOCK = () => new Date('2026-09-07T12:00:00.000Z');

/**
 * H-10: every analytics metric must share one account universe.
 *
 * Fixture: two bank accounts in the same household with crossed
 * transactions, one household subscription and one active card recurring.
 * Each metric is asserted with a single-account filter, a card filter and
 * no filter. Subscriptions carry no account relation and must be reported
 * as household-wide, never silently mixed into an account-scoped total.
 */
const seedTwoAccounts = async (app: ReturnType<typeof buildTestApp>['app']) => {
  const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, headers: H, payload });

  const a1 = await post('/accounts', { name: 'Conta A1', kind: 'bank', initialBalanceCents: 0 });
  expect(a1.statusCode).toBe(201);
  const a1Id = a1.json().id as string;
  const a2 = await post('/accounts', { name: 'Conta A2', kind: 'bank', initialBalanceCents: 0 });
  expect(a2.statusCode).toBe(201);
  const a2Id = a2.json().id as string;

  const food = await post('/categories', { name: 'Comida H10', kind: 'expense' });
  expect(food.statusCode).toBe(201);
  const foodId = food.json().id as string;
  const salary = await post('/categories', { name: 'Renda H10', kind: 'income' });
  expect(salary.statusCode).toBe(201);
  const salaryId = salary.json().id as string;

  const income = (accountId: string, amountCents: number, date: string) =>
    post('/transactions/income', { description: `in ${amountCents}`, amountCents, date, accountId, categoryId: salaryId });
  const expense = (accountId: string, amountCents: number, date: string) =>
    post('/transactions/expense', { description: `out ${amountCents}`, amountCents, date, accountId, categoryId: foodId });

  // September: A1 +100k/-30k, A2 +50k/-10k. August: A1 -20k, A2 +60k.
  expect((await income(a1Id, 100_000, '2026-09-02')).statusCode).toBe(201);
  expect((await expense(a1Id, 30_000, '2026-09-03')).statusCode).toBe(201);
  expect((await income(a2Id, 50_000, '2026-09-02')).statusCode).toBe(201);
  expect((await expense(a2Id, 10_000, '2026-09-04')).statusCode).toBe(201);
  expect((await expense(a1Id, 20_000, '2026-08-05')).statusCode).toBe(201);
  expect((await income(a2Id, 60_000, '2026-08-05')).statusCode).toBe(201);

  const sub = await post('/subscriptions', {
    name: 'Streaming',
    amountCents: 5_000,
    cycle: 'monthly',
    day: 10,
    paymentMethod: 'card',
  });
  expect(sub.statusCode).toBe(201);

  const card = await post('/cards', { name: 'Cartão', creditLimitCents: 100_000, closingDay: 5, dueDay: 10 });
  expect(card.statusCode).toBe(201);
  const cardId = card.json().id as string;
  const recurring = await post('/cards/recurring', {
    accountId: cardId,
    description: 'Mensalidade',
    amountCents: 7_000,
    frequency: 'monthly',
    startDate: '2026-09-01',
  });
  expect(recurring.statusCode).toBe(201);

  return { a1Id, a2Id, cardId };
};

const get = (app: ReturnType<typeof buildTestApp>['app'], url: string) =>
  app.inject({ method: 'GET', url, headers: { 'x-device-token': TOKEN_A } });

const SEPT = 'period=custom&from=2026-09-01&to=2026-09-30';

describe('H-10 account scope is uniform across analytics', () => {
  it('kpis scope fixed costs to the filtered account; subscriptions stay household-wide', async () => {
    const { app } = buildTestApp({}, CLOCK);
    const { a1Id, cardId } = await seedTwoAccounts(app);

    const scoped = await get(app, `/analytics/kpis?${SEPT}&accountId=${a1Id}`);
    expect(scoped.statusCode).toBe(200);
    const a1 = scoped.json();
    expect(a1.incomeCents).toBe(100_000);
    expect(a1.expenseCents).toBe(30_000);
    expect(a1.fixedVsDiscretionary.scope).toBe('account');
    // No recurring on A1 and subscriptions are household-only: excluded.
    expect(a1.fixedVsDiscretionary.fixedCents).toBe(0);
    expect(a1.fixedVsDiscretionary.subscriptionsCents).toBe(5_000);
    expect(a1.fixedVsDiscretionary.discretionaryCents).toBe(30_000);

    const card = await get(app, `/analytics/kpis?${SEPT}&accountId=${cardId}`);
    expect(card.statusCode).toBe(200);
    expect(card.json().fixedVsDiscretionary).toMatchObject({ scope: 'account', fixedCents: 7_000 });

    const all = await get(app, `/analytics/kpis?${SEPT}`);
    expect(all.statusCode).toBe(200);
    const household = all.json();
    expect(household.incomeCents).toBe(150_000);
    expect(household.expenseCents).toBe(40_000);
    expect(household.fixedVsDiscretionary).toMatchObject({
      scope: 'household',
      fixedCents: 12_000,
      subscriptionsCents: 5_000,
      discretionaryCents: 28_000,
    });
    // Household-only declaration holds at the boundary: identical either way.
    expect(household.fixedVsDiscretionary.subscriptionsCents).toBe(a1.fixedVsDiscretionary.subscriptionsCents);
  });

  it('net-worth history reconstructs from account-scoped flows', async () => {
    const { app } = buildTestApp({}, CLOCK);
    const { a1Id } = await seedTwoAccounts(app);

    const scoped = await get(app, `/analytics/net-worth-history?accountId=${a1Id}`);
    expect(scoped.statusCode).toBe(200);
    const months = scoped.json().months;
    expect(months).toHaveLength(12);
    const kpis = await get(app, `/analytics/kpis?${SEPT}&accountId=${a1Id}`);
    expect(months[11]).toMatchObject({ month: '2026-09', netWorthCents: kpis.json().netWorthCents });
    // A1: now 50k, September flow +70k → August point -20k (account universe).
    expect(months[10]).toMatchObject({ month: '2026-08', netWorthCents: -20_000 });

    const unscoped = await get(app, '/analytics/net-worth-history');
    const allMonths = unscoped.json().months;
    // Household: now 150k, September flow +110k → August point 40k.
    expect(allMonths[10]).toMatchObject({ month: '2026-08', netWorthCents: 40_000 });
    expect(allMonths[10].netWorthCents).not.toBe(months[10].netWorthCents);
  });

  it('cashflow series and category breakdown stay scoped (lock-in)', async () => {
    const { app } = buildTestApp({}, CLOCK);
    const { a1Id } = await seedTwoAccounts(app);

    const series = await get(
      app,
      `/analytics/cashflow-series?period=custom&from=2026-09-02&to=2026-09-03&accountId=${a1Id}`,
    );
    expect(series.statusCode).toBe(200);
    expect(series.json().current).toMatchObject([
      { date: '2026-09-02', valueCents: 100_000 },
      { date: '2026-09-03', valueCents: 70_000 },
    ]);

    const breakdown = await get(app, `/analytics/category-breakdown?${SEPT}&kind=expense&accountId=${a1Id}`);
    expect(breakdown.statusCode).toBe(200);
    expect(breakdown.json().totalCents).toBe(30_000);
  });

  it('budget-consumption is household-only and rejects an account filter', async () => {
    const { app } = buildTestApp({}, CLOCK);
    const { a1Id } = await seedTwoAccounts(app);

    const ok = await get(app, '/analytics/budget-consumption');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().scope).toBe('household');

    const scoped = await get(app, `/analytics/budget-consumption?accountId=${a1Id}`);
    expect(scoped.statusCode).toBe(400);
    expect(scoped.json().code).toBe('analytics.account_scope_unsupported');
  });
});
