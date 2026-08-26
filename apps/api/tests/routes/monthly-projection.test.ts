import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import { HOUSEHOLD_A, HOUSEHOLD_B, ACCOUNT_A1, ACCOUNT_A2, CATEGORY_FOOD_A, CATEGORY_SALARY_A } from '../fixtures/seed.js';
import type { Transaction } from '../../src/types/domain.js';

function makeTx(overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'householdId' | 'kind' | 'date' | 'accountId' | 'amountCents'>): Transaction {
  return {
    description: 'test',
    ...overrides,
  } as Transaction;
}

describe('GET /insights/monthly-projection', () => {
  it('requires authentication (401)', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/insights/monthly-projection?yearMonth=2026-08' });
    expect(res.statusCode).toBe(401);
  });

  it('validates yearMonth required -> 400', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/insights/monthly-projection',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.error');
  });

  it('validates yearMonth format invalid -> 400', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/insights/monthly-projection?yearMonth=2026-13',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.error');
  });

  it('validates yearMonth garbage -> 400', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/insights/monthly-projection?yearMonth=invalid',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 with yearMonth, projectedBalance, breakdown empty -> 0', async () => {
    const clock = () => new Date('2026-08-15T12:00:00Z');
    const { app } = buildTestApp({}, clock);
    const res = await app.inject({
      method: 'GET',
      url: '/insights/monthly-projection?yearMonth=2026-08',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.yearMonth).toBe('2026-08');
    expect(body).toHaveProperty('projectedBalance');
    expect(body).toHaveProperty('breakdown');
    expect(body.breakdown).toHaveProperty('income');
    expect(body.breakdown).toHaveProperty('expense');
    expect(body.breakdown).toHaveProperty('pending');
    expect(body.breakdown.income).toBe(0);
    expect(body.breakdown.expense).toBe(0);
    expect(body.breakdown.pending).toBe(0);
    expect(body.projectedBalance).toBe(0);
  });

  it('calculates projection from transactions + payables recorrentes', async () => {
    const clock = () => new Date('2026-08-15T12:00:00Z');
    const { app, state } = buildTestApp(
      {
        accounts: [ACCOUNT_A1, ACCOUNT_A2],
        categories: [CATEGORY_FOOD_A, CATEGORY_SALARY_A],
        transactions: [
          makeTx({ id: 't1', householdId: HOUSEHOLD_A, kind: 'income', date: '2026-08-01', accountId: ACCOUNT_A1.id, amountCents: 500000, categoryId: CATEGORY_SALARY_A.id, description: 'Salário' }),
          makeTx({ id: 't2', householdId: HOUSEHOLD_A, kind: 'expense', date: '2026-08-10', accountId: ACCOUNT_A1.id, amountCents: 200000, categoryId: CATEGORY_FOOD_A.id, description: 'Mercado' }),
          makeTx({ id: 't3', householdId: HOUSEHOLD_A, kind: 'expense', date: '2026-07-10', accountId: ACCOUNT_A1.id, amountCents: 999999, categoryId: CATEGORY_FOOD_A.id, description: 'Old' }),
          makeTx({ id: 't4', householdId: HOUSEHOLD_A, kind: 'transfer', date: '2026-08-12', accountId: ACCOUNT_A1.id, amountCents: 100000, description: 'transfer', transferToAccountId: ACCOUNT_A2.id }),
        ],
      },
      clock,
    );
    const anyState = state as any;
    if (!anyState._payables) anyState._payables = [];
    anyState._payables.push(
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', householdId: HOUSEHOLD_A, accountId: ACCOUNT_A1.id, description: 'Aluguel', amountCents: 150000, dueDate: '2026-08-15', type: 'recurring', frequency: 'monthly', status: 'pending' },
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', householdId: HOUSEHOLD_A, accountId: ACCOUNT_A1.id, description: 'Paid', amountCents: 100000, dueDate: '2026-08-20', type: 'one_time', status: 'paid', paidDate: '2026-08-19' },
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', householdId: HOUSEHOLD_A, accountId: ACCOUNT_A1.id, description: 'Cancelled', amountCents: 50000, dueDate: '2026-08-10', type: 'recurring', frequency: 'monthly', status: 'cancelled' },
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', householdId: HOUSEHOLD_A, accountId: ACCOUNT_A1.id, description: 'July', amountCents: 999999, dueDate: '2026-07-15', type: 'recurring', frequency: 'monthly', status: 'pending' },
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5', householdId: HOUSEHOLD_A, accountId: ACCOUNT_A1.id, description: 'Overdue Aug', amountCents: 50000, dueDate: '2026-08-05', type: 'recurring', frequency: 'monthly', status: 'overdue' },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/insights/monthly-projection?yearMonth=2026-08',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // income 500000, expense 200000, pending = 150000 + 50000 = 200000
    expect(body.breakdown.income).toBe(500000);
    expect(body.breakdown.expense).toBe(200000);
    expect(body.breakdown.pending).toBe(200000);
    expect(body.projectedBalance).toBe(500000 - 200000 - 200000); // 100000
    expect(body.yearMonth).toBe('2026-08');
  });

  it('isolates household: B data not counted for A', async () => {
    const clock = () => new Date('2026-08-15T12:00:00Z');
    const { app, state } = buildTestApp(
      {
        accounts: [ACCOUNT_A1],
        categories: [CATEGORY_SALARY_A],
        transactions: [
          makeTx({ id: 't-b1', householdId: HOUSEHOLD_B, kind: 'income', date: '2026-08-01', accountId: ACCOUNT_A1.id, amountCents: 999900, description: 'B income' }),
        ],
      },
      clock,
    );
    const anyState = state as any;
    if (!anyState._payables) anyState._payables = [];
    anyState._payables.push(
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', householdId: HOUSEHOLD_B, accountId: ACCOUNT_A1.id, description: 'B payable', amountCents: 88800, dueDate: '2026-08-10', type: 'recurring', frequency: 'monthly', status: 'pending' },
    );
    // A should see zero
    const resA = await app.inject({
      method: 'GET',
      url: '/insights/monthly-projection?yearMonth=2026-08',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(resA.statusCode).toBe(200);
    expect(resA.json().breakdown.income).toBe(0);
    expect(resA.json().breakdown.pending).toBe(0);
    expect(resA.json().projectedBalance).toBe(0);

    // B should see its own
    const resB = await app.inject({
      method: 'GET',
      url: '/insights/monthly-projection?yearMonth=2026-08',
      headers: { 'x-device-token': TOKEN_B },
    });
    expect(resB.statusCode).toBe(200);
    // B's transaction is filtered via store.listAllTransactions which filters by householdId, but our seed had HOUSEHOLD_B tx with account A1 that belongs to HOUSEHOLD_A -> still transaction householdId is B so it will be counted for B.
    // Need to ensure we pushed transaction via state directly; listAllTransactions will return it for B.
    expect(resB.json().breakdown.income).toBe(999900);
    expect(resB.json().breakdown.pending).toBe(88800);
    expect(resB.json().projectedBalance).toBe(999900 - 0 - 88800);
  });

  it('filters by yearMonth correctly (July vs Aug)', async () => {
    const clock = () => new Date('2026-08-15T12:00:00Z');
    const { app, state } = buildTestApp(
      {
        accounts: [ACCOUNT_A1],
        categories: [CATEGORY_SALARY_A, CATEGORY_FOOD_A],
        transactions: [
          makeTx({ id: 't-jul', householdId: HOUSEHOLD_A, kind: 'income', date: '2026-07-01', accountId: ACCOUNT_A1.id, amountCents: 100000, description: 'Jul income' }),
          makeTx({ id: 't-aug', householdId: HOUSEHOLD_A, kind: 'income', date: '2026-08-01', accountId: ACCOUNT_A1.id, amountCents: 200000, description: 'Aug income' }),
        ],
      },
      clock,
    );
    const anyState = state as any;
    if (!anyState._payables) anyState._payables = [];
    anyState._payables.push(
      { id: 'c1', householdId: HOUSEHOLD_A, accountId: ACCOUNT_A1.id, description: 'July pending', amountCents: 50000, dueDate: '2026-07-10', type: 'recurring', status: 'pending' },
      { id: 'c2', householdId: HOUSEHOLD_A, accountId: ACCOUNT_A1.id, description: 'Aug pending', amountCents: 70000, dueDate: '2026-08-10', type: 'recurring', status: 'pending' },
    );
    const resJul = await app.inject({
      method: 'GET',
      url: '/insights/monthly-projection?yearMonth=2026-07',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(resJul.statusCode).toBe(200);
    expect(resJul.json().breakdown.income).toBe(100000);
    expect(resJul.json().breakdown.pending).toBe(50000);

    const resAug = await app.inject({
      method: 'GET',
      url: '/insights/monthly-projection?yearMonth=2026-08',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(resAug.statusCode).toBe(200);
    expect(resAug.json().breakdown.income).toBe(200000);
    expect(resAug.json().breakdown.pending).toBe(70000);
  });
});
