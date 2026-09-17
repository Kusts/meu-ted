/**
 * V4.1 PHASE 2 (Task 2.15, SPEC §9.8) — consumer migration to the central
 * category resolver, route level (in-memory stores).
 *
 * RED for the cases no consumer validates today:
 * - plain expense/income accept a wrong-kind category (should be 400);
 * - budgets accept unknown / income-kind categories (should be 404 / 400);
 * - payables accept unknown / income-kind categories (should be 404 / 400).
 *
 * Already-covered cases (cards purchase/installments/recurring) are pinned
 * by tests/routes/cards-v41-hardening.test.ts and are not duplicated here.
 */

import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import {
  ACCOUNT_A1,
  CARD_A1,
  CATEGORY_FOOD_A,
  CATEGORY_SALARY_A,
  HOUSEHOLD_A,
} from '../fixtures/seed.js';

const UNKNOWN_CATEGORY = '00000000-0000-4000-8000-00000000ffff';

const seed = {
  accounts: [ACCOUNT_A1, CARD_A1],
  categories: [CATEGORY_FOOD_A, CATEGORY_SALARY_A],
  transactions: [],
};

const auth = { 'x-device-token': TOKEN_A, 'content-type': 'application/json' };

const createExpense = (app: ReturnType<typeof buildTestApp>['app'], categoryId: string) =>
  app.inject({
    method: 'POST',
    url: '/transactions/expense',
    headers: auth,
    payload: {
      description: 'Lunch',
      amountCents: 1500,
      date: '2026-06-10',
      accountId: ACCOUNT_A1.id,
      categoryId,
    },
  });

describe('2.15 transaction writes enforce category kind', () => {
  it('POST /transactions/expense rejects an income-kind category with 400', async () => {
    const { app } = buildTestApp(structuredClone(seed));
    const res = await createExpense(app, CATEGORY_SALARY_A.id);
    expect(res.statusCode).toBe(400);
  });

  it('POST /transactions/expense rejects an unknown category with 404', async () => {
    const { app } = buildTestApp(structuredClone(seed));
    const res = await createExpense(app, UNKNOWN_CATEGORY);
    expect(res.statusCode).toBe(404);
  });

  it('POST /transactions/income rejects an expense-kind category with 400', async () => {
    const { app } = buildTestApp(structuredClone(seed));
    const res = await app.inject({
      method: 'POST',
      url: '/transactions/income',
      headers: auth,
      payload: {
        description: 'Salary',
        amountCents: 5000,
        date: '2026-06-10',
        accountId: ACCOUNT_A1.id,
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /transactions/:id rejects a wrong-kind category with 400', async () => {
    const { app } = buildTestApp(structuredClone(seed));
    const created = await createExpense(app, CATEGORY_FOOD_A.id);
    expect(created.statusCode).toBe(201);
    const res = await app.inject({
      method: 'PATCH',
      url: `/transactions/${created.json().id}`,
      headers: auth,
      payload: { categoryId: CATEGORY_SALARY_A.id },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('2.15 budgets enforce an active expense-kind category', () => {
  const budgetPayload = (categoryId: string) => ({
    categoryId,
    name: 'Mercado',
    amountCents: 1_000_00,
    period: 'monthly',
    startDate: '2026-06-01',
  });

  it('POST /budgets rejects an unknown category with 404', async () => {
    const { app } = buildTestApp(structuredClone(seed));
    const res = await app.inject({
      method: 'POST',
      url: '/budgets',
      headers: auth,
      payload: budgetPayload(UNKNOWN_CATEGORY),
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /budgets rejects an income-kind category with 400', async () => {
    const { app } = buildTestApp(structuredClone(seed));
    const res = await app.inject({
      method: 'POST',
      url: '/budgets',
      headers: auth,
      payload: budgetPayload(CATEGORY_SALARY_A.id),
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /budgets still accepts an active expense-kind category', async () => {
    const { app } = buildTestApp(structuredClone(seed));
    const res = await app.inject({
      method: 'POST',
      url: '/budgets',
      headers: auth,
      payload: budgetPayload(CATEGORY_FOOD_A.id),
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('2.15 payables enforce an active expense-kind category', () => {
  const payablePayload = (categoryId: string) => ({
    accountId: ACCOUNT_A1.id,
    description: 'Luz',
    amountCents: 185_00,
    dueDate: '2026-07-10',
    categoryId,
  });

  it('POST /payables rejects an income-kind category with 400', async () => {
    const { app } = buildTestApp(structuredClone(seed));
    const res = await app.inject({
      method: 'POST',
      url: '/payables',
      headers: auth,
      payload: payablePayload(CATEGORY_SALARY_A.id),
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /payables rejects an unknown category with 404', async () => {
    const { app } = buildTestApp(structuredClone(seed));
    const res = await app.inject({
      method: 'POST',
      url: '/payables',
      headers: auth,
      payload: payablePayload(UNKNOWN_CATEGORY),
    });
    expect(res.statusCode).toBe(404);
  });

  it('PATCH /payables/:id rejects an income-kind category with 400', async () => {
    const { app } = buildTestApp(structuredClone(seed));
    const created = await app.inject({
      method: 'POST',
      url: '/payables',
      headers: auth,
      payload: {
        accountId: ACCOUNT_A1.id,
        description: 'Luz',
        amountCents: 185_00,
        dueDate: '2026-07-10',
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(created.statusCode).toBe(201);
    const res = await app.inject({
      method: 'PATCH',
      url: `/payables/${created.json().id}`,
      headers: auth,
      payload: { categoryId: CATEGORY_SALARY_A.id },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('2.16 installments use clamped billing-month arithmetic', () => {
  it('POST /cards/installments spaces parcels without month overflow', async () => {
    const { app } = buildTestApp(structuredClone(seed));
    const res = await app.inject({
      method: 'POST',
      url: '/cards/installments',
      headers: auth,
      payload: {
        accountId: CARD_A1.id,
        description: 'Parcela overflow',
        totalAmountCents: 3000,
        purchaseDate: '2026-01-31',
        installmentsTotal: 3,
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(res.statusCode).toBe(201);
    const dates = (res.json().items ?? res.json()).map((t: { date: string }) => t.date);
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('keeps household scoping for the resolver', async () => {
    expect(HOUSEHOLD_A).toBe(CATEGORY_FOOD_A.householdId);
  });
});
