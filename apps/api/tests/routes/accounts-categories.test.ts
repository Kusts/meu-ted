import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import {
  ACCOUNT_A1,
  ACCOUNT_A2,
  ACCOUNT_B1,
  CATEGORY_FOOD_A,
  CATEGORY_RENT_A,
  CATEGORY_FOOD_B,
  TRANSACTIONS,
} from '../fixtures/seed.js';

const seed = {
  accounts: [ACCOUNT_A1, ACCOUNT_A2, ACCOUNT_B1],
  categories: [CATEGORY_FOOD_A, CATEGORY_RENT_A, CATEGORY_FOOD_B],
  transactions: TRANSACTIONS,
};

describe('GET /accounts', () => {
  it('returns only bank/cash active accounts for the household', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(2);
    for (const acc of body.items) {
      expect(['bank', 'cash']).toContain(acc.kind);
      expect(acc.status).toBe('active');
    }
  });

  it('scopes to household A vs B', async () => {
    const { app } = buildTestApp(seed);
    const a = await app.inject({
      method: 'GET',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN_A },
    });
    const b = await app.inject({
      method: 'GET',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN_B },
    });
    expect(a.json().items).toHaveLength(2);
    expect(b.json().items).toHaveLength(1);
  });

  it('requires auth', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({ method: 'GET', url: '/accounts' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /categories', () => {
  it('returns categories for the household', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: '/categories',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBe(2);
  });

  it('filters by kind=expense', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: '/categories?kind=expense',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.json().items.every((c: { kind: string }) => c.kind === 'expense')).toBe(true);
  });

  it('requires auth', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({ method: 'GET', url: '/categories' });
    expect(res.statusCode).toBe(401);
  });
});
