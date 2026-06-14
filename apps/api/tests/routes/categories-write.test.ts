import { describe, it, expect, beforeEach } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import { randomUUID } from 'node:crypto';

describe('POST /categories', () => {
  let app: ReturnType<typeof buildTestApp>['app'];
  beforeEach(() => {
    app = buildTestApp().app;
  });

  it('creates a category and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'Mercado', kind: 'expense' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe('Mercado');
  });

  it('rejects invalid kind', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'X', kind: 'transfer' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /categories/:id', () => {
  it('renames a category', async () => {
    const { app } = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'Old', kind: 'expense' },
    });
    const id = created.json().id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/categories/${id}`,
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'New' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('New');
  });

  it('returns 404 on unknown id', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: `/categories/${randomUUID()}`,
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /categories/:id/deactivate', () => {
  it('returns 409 when category has active transactions', async () => {
    const { app } = buildTestApp();
    const acc = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'X', kind: 'bank', initialBalanceCents: 0 },
    });
    const cat = await app.inject({
      method: 'POST',
      url: '/categories',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'Food', kind: 'expense' },
    });
    await app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: {
        description: 'Lunch',
        amountCents: 1000,
        date: '2026-06-10',
        accountId: acc.json().id,
        categoryId: cat.json().id,
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/categories/${cat.json().id}/deactivate`,
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/lançamentos/);
  });
});
