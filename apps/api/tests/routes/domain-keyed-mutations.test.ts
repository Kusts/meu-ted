/**
 * V4.1 Phase 3 (UOW2) — keyed single-transaction mutations for the remaining
 * mutating routes (payables, cards, goals, budgets, subscriptions).
 *
 * Route-level contract (in-memory app; mirrors transactions-idempotency-uow):
 * - Idempotency-Key OPTIONAL everywhere below; without it behavior is unchanged.
 * - With a key: same key + same payload replays the ORIGINAL response
 *   (same status + body, incl. the mutation receipt) with
 *   `Idempotent-Replayed: true`, and produces exactly ONE effect.
 * - Same key + divergent payload → 409 idempotency.conflict.
 * - N concurrent same-key requests → exactly 1 financial effect.
 *
 * (Single-transaction atomicity itself is proven on Postgres in
 * tests/writes/domain-keyed-mutations-postgres.test.ts — the in-memory
 * producer is one synchronous step, so claim + effect cannot diverge here.)
 */
import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

const auth = (key?: string) => ({
  'x-device-token': TOKEN_A,
  'content-type': 'application/json',
  ...(key ? { 'idempotency-key': key } : {}),
});

const setupBase = async () => {
  const { app, state } = buildTestApp();
  const acc = await app.inject({
    method: 'POST', url: '/accounts', headers: auth(),
    payload: { name: 'Bank', kind: 'bank', initialBalanceCents: 500_000 },
  });
  expect(acc.statusCode).toBe(201);
  const accountId = acc.json().id as string;
  const cat = await app.inject({
    method: 'POST', url: '/categories', headers: auth(),
    payload: { name: 'Food', kind: 'expense' },
  });
  expect(cat.statusCode).toBe(201);
  const categoryId = cat.json().id as string;
  const card = await app.inject({
    method: 'POST', url: '/cards', headers: auth(),
    payload: { name: 'Visa', creditLimitCents: 100_000, closingDay: 10, dueDay: 20 },
  });
  expect(card.statusCode).toBe(201);
  const cardId = card.json().id as string;
  return { app, state, accountId, categoryId, cardId };
};

const createPayable = async (app: ReturnType<typeof buildTestApp>['app'], accountId: string, key?: string, description = 'Aluguel') => {
  const res = await app.inject({
    method: 'POST', url: '/payables', headers: auth(key),
    payload: { accountId, description, amountCents: 2000, dueDate: '2026-08-10' },
  });
  expect(res.statusCode).toBe(201);
  return res;
};

describe('POST /payables keyed', () => {
  it('replays the original create response with one effect', async () => {
    const s = await setupBase();
    const first = await createPayable(s.app, s.accountId, 'pay-create-1');
    const second = await createPayable(s.app, s.accountId, 'pay-create-1');
    expect(second.statusCode).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.json()).toEqual(first.json());
    const items = await s.app.inject({ method: 'GET', url: '/payables', headers: auth() });
    expect(items.json().total).toBe(1);
  });

  it('works without a key (contract unchanged)', async () => {
    const s = await setupBase();
    const a = await createPayable(s.app, s.accountId, undefined, 'A');
    const b = await createPayable(s.app, s.accountId, undefined, 'B');
    expect(a.json().id).not.toBe(b.json().id);
  });
});

describe('POST /payables/:id/pay keyed', () => {
  it('replays the pay receipt; concurrent same-key pays converge to 1 effect', async () => {
    const s = await setupBase();
    const created = await createPayable(s.app, s.accountId, undefined, 'Luz');
    const id = created.json().id as string;
    const payload = {};
    const first = await s.app.inject({ method: 'POST', url: `/payables/${id}/pay`, headers: auth('pay-pay-1'), payload });
    expect(first.statusCode).toBe(200);
    const second = await s.app.inject({ method: 'POST', url: `/payables/${id}/pay`, headers: auth('pay-pay-1'), payload });
    expect(second.statusCode).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.json()).toEqual(first.json());

    // Race: same key pays the same payable concurrently → one receipt, one effect.
    const created2 = await createPayable(s.app, s.accountId, undefined, 'Agua');
    const id2 = created2.json().id as string;
    const raced = await Promise.all(
      Array.from({ length: 6 }, () =>
        s.app.inject({ method: 'POST', url: `/payables/${id2}/pay`, headers: auth('pay-race-same'), payload: {} }),
      ),
    );
    for (const r of raced) expect(r.statusCode).toBe(200);
    const bodies = new Set(raced.map((r) => JSON.stringify(r.json())));
    expect(bodies.size).toBe(1);
    expect(s.state.transactions.filter((t) => t.description === 'Agua')).toHaveLength(1);
  });

  it('conflicts on divergent payload for the same key', async () => {
    const s = await setupBase();
    const created = await createPayable(s.app, s.accountId, undefined, 'Net');
    const id = created.json().id as string;
    const first = await s.app.inject({
      method: 'POST', url: `/payables/${id}/pay`, headers: auth('pay-conflict-1'), payload: { paidDate: '2026-07-01' },
    });
    expect(first.statusCode).toBe(200);
    const second = await s.app.inject({
      method: 'POST', url: `/payables/${id}/pay`, headers: auth('pay-conflict-1'), payload: { paidDate: '2026-07-02' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('idempotency.conflict');
  });
});

describe('PATCH /payables/:id keyed', () => {
  it('replays the original update response on retry', async () => {
    const s = await setupBase();
    const created = await createPayable(s.app, s.accountId, undefined, 'Old');
    const id = created.json().id as string;
    const first = await s.app.inject({
      method: 'PATCH', url: `/payables/${id}`, headers: auth('pay-patch-1'), payload: { description: 'New' },
    });
    expect(first.statusCode).toBe(200);
    const second = await s.app.inject({
      method: 'PATCH', url: `/payables/${id}`, headers: auth('pay-patch-1'), payload: { description: 'New' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.json()).toEqual(first.json());
  });
});

describe('payable templates keyed', () => {
  it('replays template creation and from-template instantiation', async () => {
    const s = await setupBase();
    const tpl = { accountId: s.accountId, name: 'Tpl1', description: 'Tpl pay', amountCents: 3000, frequency: 'monthly', dayOfMonth: 10 };
    const first = await s.app.inject({ method: 'POST', url: '/payables/templates', headers: auth('tpl-1'), payload: tpl });
    expect(first.statusCode).toBe(201);
    const second = await s.app.inject({ method: 'POST', url: '/payables/templates', headers: auth('tpl-1'), payload: tpl });
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.json()).toEqual(first.json());

    const fromTpl = { templateName: 'Tpl1', dueDate: '2026-09-10' };
    const c1 = await s.app.inject({ method: 'POST', url: '/payables/from-template', headers: auth('from-tpl-1'), payload: fromTpl });
    expect(c1.statusCode).toBe(201);
    const c2 = await s.app.inject({ method: 'POST', url: '/payables/from-template', headers: auth('from-tpl-1'), payload: fromTpl });
    expect(c2.headers['idempotent-replayed']).toBe('true');
    expect(c2.json()).toEqual(c1.json());
  });
});

describe('cards keyed mutations', () => {
  it('replays purchase creation with one effect', async () => {
    const s = await setupBase();
    const payload = { accountId: s.cardId, description: 'Shop', amountCents: 1500, date: '2026-06-10' };
    const first = await s.app.inject({ method: 'POST', url: '/cards/purchases', headers: auth('card-buy-1'), payload });
    expect(first.statusCode).toBe(201);
    const second = await s.app.inject({ method: 'POST', url: '/cards/purchases', headers: auth('card-buy-1'), payload });
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.json()).toEqual(first.json());
    expect(s.state.transactions.filter((t) => t.description === 'Shop')).toHaveLength(1);
  });

  it('races same-key purchases to exactly 1 effect', async () => {
    const s = await setupBase();
    const raced = await Promise.all(
      Array.from({ length: 6 }, () =>
        s.app.inject({
          method: 'POST', url: '/cards/purchases', headers: auth('card-race-same'),
          payload: { accountId: s.cardId, description: 'RaceBuy', amountCents: 500, date: '2026-06-10' },
        }),
      ),
    );
    for (const r of raced) expect(r.statusCode).toBe(201);
    expect(new Set(raced.map((r) => JSON.stringify(r.json()))).size).toBe(1);
    expect(s.state.transactions.filter((t) => t.description === 'RaceBuy')).toHaveLength(1);
  });

  it('replays installments, recurring and statement pay', async () => {
    const s = await setupBase();
    const inst = {
      accountId: s.cardId, description: 'Parcelado', totalAmountCents: 3000,
      purchaseDate: '2026-06-10', installmentsTotal: 3,
    };
    const i1 = await s.app.inject({ method: 'POST', url: '/cards/installments', headers: auth('card-inst-1'), payload: inst });
    expect(i1.statusCode).toBe(201);
    const i2 = await s.app.inject({ method: 'POST', url: '/cards/installments', headers: auth('card-inst-1'), payload: inst });
    expect(i2.headers['idempotent-replayed']).toBe('true');
    expect(i2.json()).toEqual(i1.json());

    const rec = { accountId: s.cardId, description: 'Stream', amountCents: 4990, frequency: 'monthly', startDate: '2026-06-01' };
    const r1 = await s.app.inject({ method: 'POST', url: '/cards/recurring', headers: auth('card-rec-1'), payload: rec });
    expect(r1.statusCode).toBe(201);
    const r2 = await s.app.inject({ method: 'POST', url: '/cards/recurring', headers: auth('card-rec-1'), payload: rec });
    expect(r2.headers['idempotent-replayed']).toBe('true');
    expect(r2.json()).toEqual(r1.json());

    const stmts = await s.app.inject({ method: 'GET', url: `/cards/statements?accountId=${s.cardId}`, headers: auth() });
    expect(stmts.statusCode).toBe(200);
    const stmtId = stmts.json().items[0].id as string;
    const remaining = (stmts.json().items[0].totalCents as number) - (stmts.json().items[0].paidCents as number);
    expect(remaining).toBeGreaterThan(0);
    const payPayload = { amountCents: remaining, fromAccountId: s.accountId };
    const p1 = await s.app.inject({ method: 'POST', url: `/cards/statements/${stmtId}/pay`, headers: auth('stmt-pay-1'), payload: payPayload });
    expect(p1.statusCode).toBe(200);
    const p2 = await s.app.inject({ method: 'POST', url: `/cards/statements/${stmtId}/pay`, headers: auth('stmt-pay-1'), payload: payPayload });
    expect(p2.headers['idempotent-replayed']).toBe('true');
    expect(p2.json()).toEqual(p1.json());
  });

  it('replays purchase cancel with the original receipt', async () => {
    const s = await setupBase();
    // Future date keeps the statement open under the real clock.
    const future = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    const buy = await s.app.inject({
      method: 'POST', url: '/cards/purchases', headers: auth(),
      payload: { accountId: s.cardId, description: 'Cancelavel', amountCents: 700, date: future },
    });
    expect(buy.statusCode).toBe(201);
    // Cancel the last parcel (open future statement) — never a paid one.
    const purchaseId = buy.json().items[0].id as string;
    const delHeaders = { 'x-device-token': TOKEN_A, 'idempotency-key': 'card-cancel-1' };
    const d1 = await s.app.inject({ method: 'DELETE', url: `/cards/purchases/${purchaseId}`, headers: delHeaders });
    expect(d1.statusCode).toBe(200);
    const d2 = await s.app.inject({ method: 'DELETE', url: `/cards/purchases/${purchaseId}`, headers: delHeaders });
    expect(d2.statusCode).toBe(200);
    expect(d2.json()).toEqual(d1.json());
  });
});

describe('goals keyed mutations', () => {
  it('replays create, contribute and update with one effect each', async () => {
    const s = await setupBase();
    const goal = { name: 'Viagem', goalType: 'savings', targetAmountCents: 10_000, startDate: '2026-01-01' };
    const g1 = await s.app.inject({ method: 'POST', url: '/goals', headers: auth('goal-create-1'), payload: goal });
    expect(g1.statusCode).toBe(201);
    const g2 = await s.app.inject({ method: 'POST', url: '/goals', headers: auth('goal-create-1'), payload: goal });
    expect(g2.headers['idempotent-replayed']).toBe('true');
    expect(g2.json()).toEqual(g1.json());
    const goalId = g1.json().id as string;

    const contrib = { amountCents: 1000 };
    const c1 = await s.app.inject({ method: 'POST', url: `/goals/${goalId}/contribute`, headers: auth('goal-contrib-1'), payload: contrib });
    expect(c1.statusCode).toBe(201);
    const c2 = await s.app.inject({ method: 'POST', url: `/goals/${goalId}/contribute`, headers: auth('goal-contrib-1'), payload: contrib });
    expect(c2.headers['idempotent-replayed']).toBe('true');
    expect(c2.json()).toEqual(c1.json());

    const u1 = await s.app.inject({
      method: 'PATCH', url: `/goals/${goalId}`, headers: auth('goal-patch-1'), payload: { name: 'Viagem 2' },
    });
    expect(u1.statusCode).toBe(200);
    const u2 = await s.app.inject({
      method: 'PATCH', url: `/goals/${goalId}`, headers: auth('goal-patch-1'), payload: { name: 'Viagem 2' },
    });
    expect(u2.headers['idempotent-replayed']).toBe('true');
    expect(u2.json()).toEqual(u1.json());
  });
});

describe('budgets keyed mutations', () => {
  it('replays create and update with one effect each', async () => {
    const s = await setupBase();
    const budget = { categoryId: s.categoryId, name: 'Food budget', amountCents: 5000, period: 'monthly', startDate: '2026-06-01' };
    const b1 = await s.app.inject({ method: 'POST', url: '/budgets', headers: auth('bud-create-1'), payload: budget });
    expect(b1.statusCode).toBe(201);
    const b2 = await s.app.inject({ method: 'POST', url: '/budgets', headers: auth('bud-create-1'), payload: budget });
    expect(b2.headers['idempotent-replayed']).toBe('true');
    expect(b2.json()).toEqual(b1.json());
    const budgetId = b1.json().id as string;

    const u1 = await s.app.inject({
      method: 'PATCH', url: `/budgets/${budgetId}`, headers: auth('bud-patch-1'), payload: { amountCents: 6000 },
    });
    expect(u1.statusCode).toBe(200);
    const u2 = await s.app.inject({
      method: 'PATCH', url: `/budgets/${budgetId}`, headers: auth('bud-patch-1'), payload: { amountCents: 6000 },
    });
    expect(u2.headers['idempotent-replayed']).toBe('true');
    expect(u2.json()).toEqual(u1.json());
  });
});

describe('POST /subscriptions keyed', () => {
  it('replays creation with one effect', async () => {
    const s = await setupBase();
    const sub = { name: 'Music', amountCents: 999, cycle: 'monthly', day: 5, paymentMethod: 'card' };
    const s1 = await s.app.inject({ method: 'POST', url: '/subscriptions', headers: auth('sub-create-1'), payload: sub });
    expect(s1.statusCode).toBe(201);
    const s2 = await s.app.inject({ method: 'POST', url: '/subscriptions', headers: auth('sub-create-1'), payload: sub });
    expect(s2.headers['idempotent-replayed']).toBe('true');
    expect(s2.json()).toEqual(s1.json());
    const list = await s.app.inject({ method: 'GET', url: '/subscriptions', headers: auth() });
    expect(list.json().total).toBe(1);
  });
});
