import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import {
  ACCOUNT_A1,
  ACCOUNT_A2,
  ACCOUNT_B1,
  CATEGORY_FOOD_A,
  CATEGORY_RENT_A,
  CATEGORY_FOOD_B,
  HOUSEHOLD_A,
  TRANSACTIONS,
} from '../fixtures/seed.js';

const seed = {
  accounts: [ACCOUNT_A1, ACCOUNT_A2, ACCOUNT_B1],
  categories: [CATEGORY_FOOD_A, CATEGORY_RENT_A, CATEGORY_FOOD_B],
  transactions: TRANSACTIONS,
};

describe('GET /transactions — filters', () => {
  it('returns all transactions for the household derived from device token', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: '/transactions',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(4);
    expect(body.items).toHaveLength(4);
    // sorted by date desc — most recent first
    expect(body.items[0]!.date).toBe('2026-06-10');
  });

  it('never returns transactions from other households (household scoping)', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: '/transactions',
      headers: { 'x-device-token': TOKEN_A },
    });
    const body = res.json();
    for (const item of body.items) {
      expect(item.householdId).toBe(HOUSEHOLD_A);
    }
  });

  it('filters by kind=expense', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: '/transactions?kind=expense',
      headers: { 'x-device-token': TOKEN_A },
    });
    const body = res.json();
    expect(body.items.every((t: { kind: string }) => t.kind === 'expense')).toBe(true);
    expect(body.total).toBe(2);
  });

  it('filters by kind=transfer and exposes transferToAccountId', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: '/transactions?kind=transfer',
      headers: { 'x-device-token': TOKEN_A },
    });
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].transferToAccountId).toBe(ACCOUNT_A2.id);
  });

  it('filters by accountId', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: `/transactions?accountId=${ACCOUNT_A2.id}`,
      headers: { 'x-device-token': TOKEN_A },
    });
    const body = res.json();
    expect(body.total).toBe(0);
  });

  it('filters by categoryId', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: `/transactions?categoryId=${CATEGORY_RENT_A.id}`,
      headers: { 'x-device-token': TOKEN_A },
    });
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.items[0].description).toBe('Aluguel');
  });

  it('filters by date range', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: '/transactions?startDate=2026-06-06&endDate=2026-06-10',
      headers: { 'x-device-token': TOKEN_A },
    });
    const body = res.json();
    expect(body.items.map((t: { date: string }) => t.date)).toEqual(['2026-06-10', '2026-06-08']);
  });

  it('filters by amount range', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: '/transactions?minAmountCents=100000&maxAmountCents=1500000',
      headers: { 'x-device-token': TOKEN_A },
    });
    const body = res.json();
    expect(body.items.every((t: { amountCents: number }) => t.amountCents >= 100_000 && t.amountCents <= 1_500_000)).toBe(true);
  });

  it('filters by case-insensitive description search', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: '/transactions?query=MERCADO',
      headers: { 'x-device-token': TOKEN_A },
    });
    const body = res.json();
    expect(body.items.map((t: { id: string }) => t.id)).toEqual(['33333333-3333-4333-8333-333333333301']);
  });

  it('combines multiple filters (kind + account + date range)', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: `/transactions?kind=expense&accountId=${ACCOUNT_A1.id}&startDate=2026-06-10&endDate=2026-06-10`,
      headers: { 'x-device-token': TOKEN_A },
    });
    const body = res.json();
    expect(body.items.map((t: { id: string }) => t.id)).toEqual(['33333333-3333-4333-8333-333333333301']);
  });

  it('paginates with limit/offset', async () => {
    const { app } = buildTestApp(seed);
    const page1 = await app.inject({
      method: 'GET',
      url: '/transactions?limit=2&offset=0',
      headers: { 'x-device-token': TOKEN_A },
    });
    const page2 = await app.inject({
      method: 'GET',
      url: '/transactions?limit=2&offset=2',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(page1.json().items).toHaveLength(2);
    expect(page2.json().items).toHaveLength(2);
    const ids1 = new Set(page1.json().items.map((t: { id: string }) => t.id));
    const ids2 = new Set(page2.json().items.map((t: { id: string }) => t.id));
    for (const id of ids2) expect(ids1.has(id)).toBe(false);
  });

  it('rejects when startDate > endDate', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: '/transactions?startDate=2026-06-30&endDate=2026-06-01',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects when minAmountCents > maxAmountCents', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: '/transactions?minAmountCents=2000&maxAmountCents=100',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects malformed kind', async () => {
    const { app } = buildTestApp(seed);
    const res = await app.inject({
      method: 'GET',
      url: '/transactions?kind=bogus',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(400);
  });

  it('ignores client-supplied household hints', async () => {
    const { app } = buildTestApp(seed);
    // Token A maps to HOUSEHOLD_A; a query asking for HOUSEHOLD_B must be ignored.
    const res = await app.inject({
      method: 'GET',
      url: `/transactions?accountId=${ACCOUNT_B1.id}`,
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.json().total).toBe(0);
  });

  it('different device tokens see different households', async () => {
    const { app } = buildTestApp(seed);
    const a = await app.inject({
      method: 'GET',
      url: '/transactions',
      headers: { 'x-device-token': TOKEN_A },
    });
    const b = await app.inject({
      method: 'GET',
      url: '/transactions',
      headers: { 'x-device-token': TOKEN_B },
    });
    expect(a.json().total).toBe(4);
    expect(b.json().total).toBe(1);
  });
});
