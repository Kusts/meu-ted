/**
 * V4.1 REVIEWFIX — payload identity must embed route params (Finding 1 [major]).
 *
 * A keyed mutation's hashed payload must include the route's resource id:
 * the same Idempotency-Key + same body on DIFFERENT resource ids must raise
 * a 409 idempotency conflict, never replay the wrong receipt.
 *
 * RED: POST /payables/:id/pay and POST /cards/statements/:id/pay hash only
 * the body, so cross-id reuse replays the first receipt (200).
 */
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

const auth = (key?: string) => ({
  'x-device-token': TOKEN_A,
  'content-type': 'application/json',
  ...(key ? { 'idempotency-key': key } : {}),
});

const seed = {
  accounts: [ACCOUNT_A1, ACCOUNT_A2, CARD_A1],
  categories: [CATEGORY_FOOD_A, CATEGORY_RENT_A, CATEGORY_SALARY_A],
  transactions: [],
};

function freshSeed() {
  return JSON.parse(JSON.stringify(seed)) as typeof seed;
}

const seedPayable = async (
  app: ReturnType<typeof buildTestApp>['app'],
  description: string,
) => {
  const created = await app.inject({
    method: 'POST',
    url: '/payables',
    headers: auth(`seed-payable-${crypto.randomUUID()}`),
    payload: {
      accountId: ACCOUNT_A1.id,
      description,
      amountCents: 10_000,
      dueDate: '2026-06-15',
      categoryId: CATEGORY_FOOD_A.id,
    },
  });
  expect(created.statusCode).toBe(201);
  return created.json().id as string;
};

describe('Finding 1 — keyed payload embeds the route resource id', () => {
  it('POST /payables/:id/pay: same key+body on two payable ids → 409 idempotency conflict', async () => {
    const { app } = buildTestApp(freshSeed());
    const id1 = await seedPayable(app, 'Luz A');
    const id2 = await seedPayable(app, 'Luz B');
    const key = `pay-identity-${crypto.randomUUID()}`;
    const body = { paidDate: '2026-06-14' };

    const first = await app.inject({
      method: 'POST', url: `/payables/${id1}/pay`, headers: auth(key), payload: body,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST', url: `/payables/${id2}/pay`, headers: auth(key), payload: body,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('idempotency.conflict');
  });

  it('POST /payables/:id/pay: same key+body on the SAME id still replays', async () => {
    const { app } = buildTestApp(freshSeed());
    const id = await seedPayable(app, 'Luz replay');
    const key = `pay-replay-${crypto.randomUUID()}`;
    const body = { paidDate: '2026-06-14' };

    const first = await app.inject({
      method: 'POST', url: `/payables/${id}/pay`, headers: auth(key), payload: body,
    });
    expect(first.statusCode).toBe(200);

    const replay = await app.inject({
      method: 'POST', url: `/payables/${id}/pay`, headers: auth(key), payload: body,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
  });

  it('POST /goals/:id/contribute: same key+body on two goal ids → 409 idempotency conflict', async () => {
    const { app } = buildTestApp(freshSeed());
    const mkGoal = async (name: string) => {
      const res = await app.inject({
        method: 'POST', url: '/goals', headers: auth(`seed-goal-${crypto.randomUUID()}`),
        payload: { name, goalType: 'savings', targetAmountCents: 100_000, startDate: '2026-06-01' },
      });
      expect(res.statusCode).toBe(201);
      return res.json().id as string;
    };
    const g1 = await mkGoal('Meta A');
    const g2 = await mkGoal('Meta B');
    const key = `goal-identity-${crypto.randomUUID()}`;
    const body = { amountCents: 5_000 };

    const first = await app.inject({
      method: 'POST', url: `/goals/${g1}/contribute`, headers: auth(key), payload: body,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST', url: `/goals/${g2}/contribute`, headers: auth(key), payload: body,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('idempotency.conflict');
  });

  it('PATCH /transactions/:id: same key+body on two transaction ids → 409 idempotency conflict', async () => {
    const { app } = buildTestApp(freshSeed());
    const mkTx = async (description: string) => {
      const res = await app.inject({
        method: 'POST', url: '/transactions/expense', headers: auth(`seed-tx-${crypto.randomUUID()}`),
        payload: {
          description, amountCents: 1_500, date: '2026-06-10',
          accountId: ACCOUNT_A1.id, categoryId: CATEGORY_FOOD_A.id,
        },
      });
      expect(res.statusCode).toBe(201);
      return res.json().id as string;
    };
    const t1 = await mkTx('Lunch A');
    const t2 = await mkTx('Lunch B');
    const key = `txpatch-identity-${crypto.randomUUID()}`;
    const body = { description: 'Dinner' };

    const first = await app.inject({
      method: 'PATCH', url: `/transactions/${t1}`, headers: auth(key), payload: body,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'PATCH', url: `/transactions/${t2}`, headers: auth(key), payload: body,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('idempotency.conflict');
  });

  it('POST /cards/statements/:id/pay: same key+body on two statement ids → 409 idempotency conflict', async () => {
    const { app } = buildTestApp(freshSeed());
    // Two purchases in different billing months → two open statements.
    const mkPurchase = async (date: string) => {
      const res = await app.inject({
        method: 'POST', url: '/cards/purchases', headers: auth(`seed-purchase-${crypto.randomUUID()}`),
        payload: {
          accountId: CARD_A1.id, description: 'Mercado', amountCents: 150_00,
          date, categoryId: CATEGORY_FOOD_A.id,
        },
      });
      expect(res.statusCode).toBe(201);
    };
    await mkPurchase('2026-06-15');
    await mkPurchase('2026-07-15');
    const statements = (await app.inject({
      method: 'GET', url: `/cards/statements?accountId=${CARD_A1.id}`, headers: auth(),
    })).json().items as Array<{ id: string }>;
    expect(statements).toHaveLength(2);
    const [s1, s2] = statements as [{ id: string }, { id: string }];
    const key = `stmt-identity-${crypto.randomUUID()}`;
    const body = { amountCents: 10_00, fromAccountId: ACCOUNT_A1.id };

    const first = await app.inject({
      method: 'POST', url: `/cards/statements/${s1.id}/pay`, headers: auth(key), payload: body,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST', url: `/cards/statements/${s2.id}/pay`, headers: auth(key), payload: body,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('idempotency.conflict');
  });
});
