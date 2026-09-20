/**
 * TASK require-financial-idempotency (TDD RED):
 * Toda mutação financeira HTTP deve exigir `Idempotency-Key`.
 */
import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import {
  ACCOUNT_A1,
  ACCOUNT_A2,
  CARD_A1,
  CATEGORY_FOOD_A,
  CATEGORY_SALARY_A,
} from '../fixtures/seed.js';

const baseSeed = {
  accounts: [ACCOUNT_A1, ACCOUNT_A2, CARD_A1],
  categories: [CATEGORY_FOOD_A, CATEGORY_SALARY_A],
  transactions: [],
};

const freshSeed = () => JSON.parse(JSON.stringify(baseSeed)) as typeof baseSeed;
const noKey = { 'x-device-token': TOKEN_A, 'content-type': 'application/json' };
const withKey = (key: string) => ({ ...noKey, 'idempotency-key': key });

describe('require-financial-idempotency', () => {
  it('POST /transactions/expense sem chave → 400 antes do produtor', async () => {
    const { app, state } = buildTestApp(freshSeed());
    const before = state.transactions.length;
    const res = await app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: noKey,
      payload: {
        description: 'Lanche',
        amountCents: 1500,
        date: '2026-06-10',
        accountId: ACCOUNT_A1.id,
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.required');
    expect(state.transactions.length).toBe(before);
  });

  it('POST /transactions/expense com chave preserva comportamento', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: withKey(`exp-${crypto.randomUUID()}`),
      payload: {
        description: 'Lanche',
        amountCents: 1500,
        date: '2026-06-10',
        accountId: ACCOUNT_A1.id,
        categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /transfers sem chave → 400', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/transfers',
      headers: noKey,
      payload: {
        fromAccountId: ACCOUNT_A1.id,
        toAccountId: ACCOUNT_A2.id,
        amountCents: 1000,
        date: '2026-06-10',
        description: 'x',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.required');
  });

  it('POST /accounts sem chave → 400; com chave → 201', async () => {
    const { app } = buildTestApp(freshSeed());
    const missing = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: noKey,
      payload: { name: 'Carteira', kind: 'cash', initialBalanceCents: 0 },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().code).toBe('validation.required');
    const ok = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: withKey(`acc-${crypto.randomUUID()}`),
      payload: { name: 'Carteira', kind: 'cash', initialBalanceCents: 0 },
    });
    expect(ok.statusCode).toBe(201);
  });

  it('POST /payables sem chave → 400; com chave → 201', async () => {
    const { app } = buildTestApp(freshSeed());
    const payload = {
      accountId: ACCOUNT_A1.id,
      description: 'Luz',
      amountCents: 10000,
      dueDate: '2026-06-15',
      categoryId: CATEGORY_FOOD_A.id,
    };
    const missing = await app.inject({ method: 'POST', url: '/payables', headers: noKey, payload });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().code).toBe('validation.required');
    const ok = await app.inject({ method: 'POST', url: '/payables', headers: withKey(`pay-${crypto.randomUUID()}`), payload });
    expect(ok.statusCode).toBe(201);
  });

  it('POST /budgets sem chave → 400; com chave → 201', async () => {
    const { app } = buildTestApp(freshSeed());
    const payload = {
      categoryId: CATEGORY_FOOD_A.id,
      name: 'Mercado',
      amountCents: 50000,
      period: 'monthly',
      startDate: '2026-06-01',
    };
    const missing = await app.inject({ method: 'POST', url: '/budgets', headers: noKey, payload });
    expect(missing.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/budgets', headers: withKey(`bud-${crypto.randomUUID()}`), payload });
    expect(ok.statusCode).toBe(201);
  });

  it('POST /goals e POST /subscriptions e POST /categories sem chave → 400', async () => {
    const { app } = buildTestApp(freshSeed());
    const goal = await app.inject({
      method: 'POST', url: '/goals', headers: noKey,
      payload: { name: 'Reserva', goalType: 'savings', targetAmountCents: 100000, startDate: '2026-06-01' },
    });
    expect(goal.statusCode).toBe(400);
    const sub = await app.inject({
      method: 'POST', url: '/subscriptions', headers: noKey,
      payload: { name: 'Netflix', amountCents: 5500, cycle: 'monthly', day: 10, paymentMethod: 'card' },
    });
    expect(sub.statusCode).toBe(400);
    const cat = await app.inject({
      method: 'POST', url: '/categories', headers: noKey,
      payload: { name: 'Lazer', kind: 'expense' },
    });
    expect(cat.statusCode).toBe(400);
  });

  it('POST /cards/purchases sem chave → 400; com chave → 201', async () => {
    const { app } = buildTestApp(freshSeed());
    const payload = {
      accountId: CARD_A1.id,
      description: 'Mercado',
      amountCents: 15000,
      date: '2026-06-15',
      categoryId: CATEGORY_FOOD_A.id,
    };
    const missing = await app.inject({ method: 'POST', url: '/cards/purchases', headers: noKey, payload });
    expect(missing.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/cards/purchases', headers: withKey(`card-${crypto.randomUUID()}`), payload });
    expect(ok.statusCode).toBe(201);
  });

  it('PATCH e DELETE /transactions/:id sem chave → 400', async () => {
    const { app } = buildTestApp(freshSeed());
    const created = await app.inject({
      method: 'POST', url: '/transactions/expense', headers: withKey(`seed-${crypto.randomUUID()}`),
      payload: {
        description: 'Jantar', amountCents: 2000, date: '2026-06-10',
        accountId: ACCOUNT_A1.id, categoryId: CATEGORY_FOOD_A.id,
      },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    const patched = await app.inject({ method: 'PATCH', url: `/transactions/${id}`, headers: noKey, payload: { description: 'Novo' } });
    expect(patched.statusCode).toBe(400);
    expect(patched.json().code).toBe('validation.required');
    const deleted = await app.inject({ method: 'DELETE', url: `/transactions/${id}`, headers: { 'x-device-token': TOKEN_A } });
    expect(deleted.statusCode).toBe(400);
    expect(deleted.json().code).toBe('validation.required');
  });

  it('não altera auth: POST /auth/devices/revoke sem chave não retorna validation.required', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/revoke',
      headers: noKey,
      payload: { token: 'dev-token-1' },
    });
    // Pode ser 401/400 de auth, mas nunca exigência de Idempotency-Key.
    expect(res.json()?.code ?? '').not.toBe('validation.required');
  });

  it('não altera não-financeiro: POST /client-events sem chave continua funcionando', async () => {
    const { app } = buildTestApp(freshSeed());
    const res = await app.inject({
      method: 'POST',
      url: '/client-events',
      headers: noKey,
      payload: { eventType: 'mic.error', payload: { reason: 'denied', capability: 'on' } },
    });
    expect(res.statusCode).toBe(204);
  });
});
