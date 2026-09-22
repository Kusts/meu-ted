import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import {
  ACCOUNT_A1,
  ACCOUNT_A2,
  CARD_A1,
  CATEGORY_FOOD_A,
  CATEGORY_RENT_A,
  CATEGORY_SALARY_A,
} from '../fixtures/seed.js';

const seed = {
  accounts: [ACCOUNT_A1, ACCOUNT_A2, CARD_A1],
  categories: [CATEGORY_FOOD_A, CATEGORY_RENT_A, CATEGORY_SALARY_A],
  transactions: [],
};

function freshSeed() {
  return JSON.parse(JSON.stringify(seed)) as typeof seed;
}

function auth(token: string = TOKEN_A) {
  return { 'x-device-token': token, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() };
}

/**
 * V4.1 REVIEWFIX F7 [major] — updatePurchase allowed after statement
 * paid/closed. cancelPurchase already guards; the PATCH path must too: under
 * the statement lock, only status='open' statements accept purchase edits.
 *
 * NOTE: future purchase dates keep the fixture statement genuinely 'open'
 * regardless of wall-clock (computeStatus is wall-clock relative).
 */
const futureDate = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
const setupPurchase = async (app: ReturnType<typeof buildTestApp>['app']) => {
  const create = await app.inject({
    method: 'POST', url: '/cards/purchases', headers: auth(),
    payload: {
      accountId: CARD_A1.id, description: 'Mercado', amountCents: 150_00,
      date: futureDate, categoryId: CATEGORY_FOOD_A.id,
    },
  });
  expect(create.statusCode).toBe(201);
  const purchaseId = create.json().items[0].id as string;
  const stmtId = (await app.inject({
    method: 'GET', url: `/cards/statements?accountId=${CARD_A1.id}`, headers: auth(),
  })).json().items[0].id as string;
  return { purchaseId, stmtId };
};

describe('V4.1 REVIEWFIX F7 — purchase PATCH requires an open statement', () => {
  it('PATCH on an open statement → 200 (control)', async () => {
    const { app } = buildTestApp(freshSeed());
    const { purchaseId } = await setupPurchase(app);

    const patch = await app.inject({
      method: 'PATCH', url: `/cards/purchases/${purchaseId}`, headers: auth(),
      payload: { description: 'Feira' },
    });
    expect(patch.statusCode).toBe(200);
  });

  it('PATCH after the statement is fully paid → 4xx', async () => {
    const { app } = buildTestApp(freshSeed());
    const { purchaseId, stmtId } = await setupPurchase(app);

    const pay = await app.inject({
      method: 'POST', url: `/cards/statements/${stmtId}/pay`, headers: auth(),
      payload: { amountCents: 150_00, fromAccountId: ACCOUNT_A1.id },
    });
    expect(pay.statusCode).toBe(200);

    const patch = await app.inject({
      method: 'PATCH', url: `/cards/purchases/${purchaseId}`, headers: auth(),
      payload: { description: 'Feira' },
    });
    expect(patch.statusCode).toBeGreaterThanOrEqual(400);
    expect(patch.statusCode).toBeLessThan(500);
  });
});
