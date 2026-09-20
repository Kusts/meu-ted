/**
 * M-04/M-05/H-04 (route level, in-memory): card purchase integrity.
 *
 * - M-05: card purchases enforce the same active/expense-kind category rule
 *   as plain entries, including subcategory parent checks.
 * - M-04: notes + subcategoryId flow into every parcel and the 1x response;
 *   every purchase keeps its card_purchases audit link (visible in the
 *   statement detail).
 * - H-04: two concurrent purchases in the same cycle converge on a single
 *   statement (in-memory uses deterministic statement ids; the postgres
 *   upsert path is covered by tests/cards/statement-upsert.test.ts and the
 *   V047 migration contract test).
 */
import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import {
  ACCOUNT_A1,
  ACCOUNT_A2,
  CARD_A1,
  CATEGORY_FOOD_A,
  CATEGORY_RENT_A,
  CATEGORY_FOOD_B,
} from '../fixtures/seed.js';

const seed = {
  accounts: [ACCOUNT_A1, ACCOUNT_A2, CARD_A1],
  categories: [CATEGORY_FOOD_A, CATEGORY_RENT_A, CATEGORY_FOOD_B],
  transactions: [],
};

function freshSeed() {
  return JSON.parse(JSON.stringify(seed)) as typeof seed;
}

function auth() {
  return { 'x-device-token': TOKEN_A, 'content-type': 'application/json' , 'idempotency-key': crypto.randomUUID() };
}

const purchase = (overrides: Record<string, unknown> = {}) => ({
  accountId: CARD_A1.id,
  description: 'Compra',
  amountCents: 100_00,
  date: '2026-08-20',
  categoryId: CATEGORY_FOOD_A.id,
  ...overrides,
});

describe('M-05 card purchase category validation', () => {
  it('rejects an inactive category with 404', async () => {
    const { app } = buildTestApp(freshSeed());
    const cat = await app.inject({
      method: 'POST', url: '/categories', headers: auth(),
      payload: { name: 'Velha', kind: 'expense' },
    });
    const deact = await app.inject({
      method: 'POST', url: `/categories/${cat.json().id}/deactivate`, headers: auth(), payload: {},
    });
    expect([200, 204]).toContain(deact.statusCode);
    const res = await app.inject({
      method: 'POST', url: '/cards/purchases', headers: auth(),
      payload: purchase({ categoryId: cat.json().id }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an income-kind category with 400', async () => {
    const { app } = buildTestApp(freshSeed());
    const cat = await app.inject({
      method: 'POST', url: '/categories', headers: auth(),
      payload: { name: 'Salário', kind: 'income' },
    });
    const res = await app.inject({
      method: 'POST', url: '/cards/purchases', headers: auth(),
      payload: purchase({ categoryId: cat.json().id }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.invalid');
  });

  it('rejects a subcategory belonging to another macro with 400', async () => {
    const { app } = buildTestApp(freshSeed());
    const macroA = await app.inject({
      method: 'POST', url: '/categories', headers: auth(),
      payload: { name: 'Comida', kind: 'expense' },
    });
    const macroB = await app.inject({
      method: 'POST', url: '/categories', headers: auth(),
      payload: { name: 'Bricolagem', kind: 'expense' },
    });
    const subA = await app.inject({
      method: 'POST', url: '/categories', headers: auth(),
      payload: { name: 'Feira', kind: 'expense', parentId: macroA.json().id },
    });
    const res = await app.inject({
      method: 'POST', url: '/cards/purchases', headers: auth(),
      payload: purchase({ categoryId: macroB.json().id, subcategoryId: subA.json().id }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects installments with an income-kind category with 400', async () => {
    const { app } = buildTestApp(freshSeed());
    const cat = await app.inject({
      method: 'POST', url: '/categories', headers: auth(),
      payload: { name: 'Salário', kind: 'income' },
    });
    const res = await app.inject({
      method: 'POST', url: '/cards/installments', headers: auth(),
      payload: {
        accountId: CARD_A1.id, description: 'X', totalAmountCents: 600_00,
        purchaseDate: '2026-08-20', installmentsTotal: 3, categoryId: cat.json().id,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('M-04 installments preserve metadata on every parcel', () => {
  it('carries notes + subcategoryId into all parcels and the statement link', async () => {
    const { app } = buildTestApp(freshSeed());
    const macro = await app.inject({
      method: 'POST', url: '/categories', headers: auth(),
      payload: { name: 'Comida', kind: 'expense' },
    });
    const sub = await app.inject({
      method: 'POST', url: '/categories', headers: auth(),
      payload: { name: 'Feira', kind: 'expense', parentId: macro.json().id },
    });
    const res = await app.inject({
      method: 'POST', url: '/cards/installments', headers: auth(),
      payload: {
        accountId: CARD_A1.id, description: 'Notebook', totalAmountCents: 1000_00,
        purchaseDate: '2026-08-20', installmentsTotal: 3,
        categoryId: macro.json().id, subcategoryId: sub.json().id,
        notes: 'Para o trabalho',
      },
    });
    expect(res.statusCode).toBe(201);
    const items = res.json().items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item['notes']).toBe('Para o trabalho');
      expect(item['subcategoryId']).toBe(sub.json().id);
    }
    expect(items.reduce((s, t) => s + (t['amountCents'] as number), 0)).toBe(1000_00);
  });

  it('1x purchase returns notes in the response', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST', url: '/cards/purchases', headers: auth(),
      payload: purchase({ notes: 'Almoço com cliente' }),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().items[0].notes).toBe('Almoço com cliente');
  });
});

describe('H-04 concurrent purchases share one statement', () => {
  it('two concurrent same-cycle purchases converge (in-memory deterministic ids)', async () => {
    const { app } = buildTestApp(freshSeed());
    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: '/cards/purchases', headers: auth(), payload: purchase({ description: 'A' }) }),
      app.inject({ method: 'POST', url: '/cards/purchases', headers: auth(), payload: purchase({ description: 'B' }) }),
    ]);
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    const stmts = await app.inject({
      method: 'GET', url: `/cards/statements?accountId=${CARD_A1.id}`, headers: { 'x-device-token': TOKEN_A },
    });
    expect(stmts.json().items).toHaveLength(1);
    const detail = await app.inject({
      method: 'GET', url: `/cards/statements/${stmts.json().items[0].id}`, headers: { 'x-device-token': TOKEN_A },
    });
    expect(detail.json().purchases).toHaveLength(2);
  });
});
