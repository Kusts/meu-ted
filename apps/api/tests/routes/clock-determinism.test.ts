import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import {
  ACCOUNT_A1,
  ACCOUNT_A2,
  ACCOUNT_B1,
  CATEGORY_FOOD_A,
  CATEGORY_RENT_A,
  CATEGORY_FOOD_B,
  TRANSACTIONS,
} from '../fixtures/seed.js';

// P0.4 — Relógio determinístico (closure injection).
// Prova que o mês agregado no dashboard usa o clock INJETADO e não `new Date()` real.
const seed = {
  accounts: [ACCOUNT_A1, ACCOUNT_A2, ACCOUNT_B1],
  categories: [CATEGORY_FOOD_A, CATEGORY_RENT_A, CATEGORY_FOOD_B],
  transactions: TRANSACTIONS,
};

const JUNE = () => new Date('2026-06-15T12:00:00Z');
const DECEMBER = () => new Date('2026-12-15T12:00:00Z');

describe('deterministic clock injection (P0.4)', () => {
  it('uses the injected June clock for month aggregation', async () => {
    const { app } = buildTestApp(seed, JUNE);
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/summary',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().monthIncomeCents).toBe(1_200_000);
  });

  it('does NOT leak the real wall-clock: December clock yields zero June income', async () => {
    const { app } = buildTestApp(seed, DECEMBER);
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard/summary',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().monthIncomeCents).toBe(0);
  });
});
