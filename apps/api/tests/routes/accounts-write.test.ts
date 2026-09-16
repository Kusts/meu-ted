import { describe, it, expect, beforeEach } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import { randomUUID } from 'node:crypto';

const isoDate = '2026-06-10';

describe('POST /accounts', () => {
  let app: ReturnType<typeof buildTestApp>['app'];
  let _state: ReturnType<typeof buildTestApp>['state'];

  beforeEach(() => {
    const t = buildTestApp();
    app = t.app;
    _state = t.state;
  });

  it('creates an account and returns 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'Itaú', kind: 'bank', initialBalanceCents: 100_000 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe('Itaú');
    expect(body.kind).toBe('bank');
    expect(body.balanceCents).toBe(100_000);
    expect(body.status).toBe('active');
  });

  it('rejects with 400 on invalid kind', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'X', kind: 'crypto', initialBalanceCents: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects with 400 on negative balance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'X', kind: 'bank', initialBalanceCents: -1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'X', kind: 'bank', initialBalanceCents: 0 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('new account is visible on subsequent GET /accounts', async () => {
    await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'New', kind: 'cash', initialBalanceCents: 0 },
    });
    const list = await app.inject({ method: 'GET', url: '/accounts', headers: { 'x-device-token': TOKEN_A } });
    expect(list.json().items.find((a: { name: string }) => a.name === 'New')).toBeDefined();
  });
});

describe('PATCH /accounts/:id', () => {
  it('renames an account', async () => {
    const { app } = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'Old', kind: 'bank', initialBalanceCents: 0 },
    });
    const id = created.json().id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/accounts/${id}`,
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
      url: `/accounts/${randomUUID()}`,
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /accounts/:id/deactivate', () => {
  it('deactivates an account with no transactions', async () => {
    const { app } = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'X', kind: 'bank', initialBalanceCents: 0 },
    });
    const id = created.json().id;
    const res = await app.inject({
      method: 'POST',
      url: `/accounts/${id}/deactivate`,
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('inactive');
  });

  it('returns 409 when account has active transactions', async () => {
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
        date: isoDate,
        accountId: acc.json().id,
        categoryId: cat.json().id,
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/accounts/${acc.json().id}/deactivate`,
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('in_use');
    expect(res.json().message).toMatch(/lançamentos/);
  });
});
