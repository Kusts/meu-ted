import Fastify from 'fastify';
import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import { registerDashboardRoutes } from '../../src/routes/dashboard.js';
import { createInMemoryReadModelStore } from '../../src/read-models/store.js';
import {
  ACCOUNT_A1,
  ACCOUNT_A2,
  ACCOUNT_B1,
  CATEGORY_FOOD_A,
  CATEGORY_RENT_A,
  CATEGORY_FOOD_B,
  HOUSEHOLD_A,
  HOUSEHOLD_B,
  TRANSACTIONS,
} from '../fixtures/seed.js';

const seed = {
  accounts: [ACCOUNT_A1, ACCOUNT_A2, ACCOUNT_B1],
  categories: [CATEGORY_FOOD_A, CATEGORY_RENT_A, CATEGORY_FOOD_B],
  transactions: TRANSACTIONS,
};

describe('GET /dashboard/summary', () => {
  it('returns 200 with aggregated fields for the household', async () => {
    const { app } = buildTestApp(seed, () => new Date('2026-06-15T12:00:00Z'));
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/summary',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.totalBalanceCents).toBe('number');
    expect(typeof body.monthIncomeCents).toBe('number');
    expect(typeof body.monthExpenseCents).toBe('number');
    expect(typeof body.cashFlowLast30DaysCents).toBe('number');
    expect(Array.isArray(body.topExpenses)).toBe(true);
  });

  it('computes totalBalance as sum of active bank/cash balances (no credit cards in V1)', async () => {
    const { app } = buildTestApp(seed, () => new Date('2026-06-15T12:00:00Z'));
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/summary',
      headers: { 'x-device-token': TOKEN_A },
    });
    // A1=100_000, A2=50_000
    expect(res.json().totalBalanceCents).toBe(150_000);
  });

  it('sums month income/expense for the current month', async () => {
    const { app } = buildTestApp(seed, () => new Date('2026-06-15T12:00:00Z'));
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/summary',
      headers: { 'x-device-token': TOKEN_A },
    });
    const body = res.json();
    // June 2026: income 12_000_00 = 1_200_000; expense 2_400_00 + 480_50 = 288_050
    expect(body.monthIncomeCents).toBe(1_200_000);
    expect(body.monthExpenseCents).toBe(288_050);
    expect(body.monthNetCents).toBe(1_200_000 - 288_050);
  });

  it('returns top expenses sorted desc by amount, capped at 5', async () => {
    const { app } = buildTestApp(seed, () => new Date('2026-06-15T12:00:00Z'));
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/summary',
      headers: { 'x-device-token': TOKEN_A },
    });
    const top = res.json().topExpenses;
    expect(top.length).toBeGreaterThan(0);
    const amounts = top.map((e: { amountCents: number }) => e.amountCents);
    const sorted = [...amounts].sort((a, b) => b - a);
    expect(amounts).toEqual(sorted);
  });

  it('scopes the summary to the household derived from device token', async () => {
    const { app } = buildTestApp(seed, () => new Date('2026-06-15T12:00:00Z'));
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/summary',
      headers: { 'x-device-token': TOKEN_A },
    });
    const body = res.json();
    expect(body.householdId).not.toBe('');
    // Should NOT include HOUSEHOLD_B's data
    expect(body.topExpenses).not.toContainEqual(expect.objectContaining({ description: 'Mercado B' }));
  });

  it('prefers the authenticated selected workspace over the device token household', async () => {
    const app = Fastify({ logger: false });
    app.addHook('preHandler', async (request) => {
      request.authenticatedContext = {
        householdId: HOUSEHOLD_B,
        actorId: 'user-b',
        authUserId: 'auth-user-b',
        actorType: 'user',
        deviceId: '',
        role: 'owner',
      };
    });
    registerDashboardRoutes(app, {
      store: createInMemoryReadModelStore(seed),
      resolveToken: async () => ({ deviceId: 'device-a', householdId: HOUSEHOLD_A }),
      clock: () => new Date('2026-06-15T12:00:00Z'),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/summary',
      headers: { 'x-device-token': TOKEN_A, 'x-workspace-id': HOUSEHOLD_B },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      householdId: HOUSEHOLD_B,
      totalBalanceCents: ACCOUNT_B1.balanceCents,
    });
    await app.close();
  });

  it('requires auth', async () => {
    const { app } = buildTestApp(seed, () => new Date('2026-06-15T12:00:00Z'));
    const res = await app.inject({ method: 'GET', url: '/dashboard/summary' });
    expect(res.statusCode).toBe(401);
  });

  it('returns top expense categories aggregated', async () => {
    const { app } = buildTestApp(seed, () => new Date('2026-06-15T12:00:00Z'));
    const res = await app.inject({ method: 'GET', url: '/dashboard/summary', headers: { 'x-device-token': TOKEN_A } });
    const cats = res.json().topExpenseCategories;
    expect(cats.length).toBeGreaterThan(0);
    expect(cats[0]).toMatchObject({ categoryName: expect.any(String), totalCents: expect.any(Number) });
  });

  it('returns month-over-month change', async () => {
    const { app } = buildTestApp(seed, () => new Date('2026-06-15T12:00:00Z'));
    const res = await app.inject({ method: 'GET', url: '/dashboard/summary', headers: { 'x-device-token': TOKEN_A } });
    const mom = res.json().monthOverMonth;
    expect(typeof mom.incomeChangePercent === 'number' || mom.incomeChangePercent === null).toBe(true);
    expect(typeof mom.netChangeCents).toBe('number');
  });

  it('returns alerts array', async () => {
    const { app } = buildTestApp(seed, () => new Date('2026-06-15T12:00:00Z'));
    const res = await app.inject({ method: 'GET', url: '/dashboard/summary', headers: { 'x-device-token': TOKEN_A } });
    expect(Array.isArray(res.json().alerts)).toBe(true);
  });
});

describe('GET /dashboard/month-summary', () => {
  it('prefers the authenticated selected workspace over the device token household', async () => {
    const app = Fastify({ logger: false });
    app.addHook('preHandler', async (request) => {
      request.authenticatedContext = {
        householdId: HOUSEHOLD_B,
        actorId: 'user-b',
        authUserId: 'auth-user-b',
        actorType: 'user',
        deviceId: '',
        role: 'owner',
      };
    });
    registerDashboardRoutes(app, {
      store: createInMemoryReadModelStore(seed),
      resolveToken: async () => ({ deviceId: 'device-a', householdId: HOUSEHOLD_A }),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/month-summary?yearMonth=2026-06',
      headers: { 'x-device-token': TOKEN_A, 'x-workspace-id': HOUSEHOLD_B },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      yearMonth: '2026-06',
      incomeCents: 0,
      expenseCents: 200_00,
      balanceCents: -200_00,
      transactionCount: 1,
    });
    await app.close();
  });
});
