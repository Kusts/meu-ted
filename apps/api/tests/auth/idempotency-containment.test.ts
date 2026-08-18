/**
 * Phase 0.4 — Idempotency containment tests.
 *
 * 0.4.1 — RED: two concurrent requests with same key produce ONE effect.
 * 0.4.2 — Different payload with same key returns conflict.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

const EXPENSE_URL = '/transactions/expense';

describe('G2.2.4 — mandatory key at the HTTP boundary', () => {
  it('rejects an authenticated mutation without Idempotency-Key before writing', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'Must not persist', kind: 'bank', initialBalanceCents: 1000 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation.required');
    const accounts = await app.inject({ method: 'GET', url: '/accounts', headers: { 'x-device-token': TOKEN_A } });
    expect(accounts.json().items.some((account: { name: string }) => account.name === 'Must not persist')).toBe(false);
  });
});

describe('0.4.1 — concurrent idempotency: same key → single effect', () => {
  let app: ReturnType<typeof buildTestApp>['app'];
  beforeEach(() => { app = buildTestApp().app; });

  it('four concurrent expense writes with same idempotency-key produce exactly one transaction', async () => {
    const accRes = await app.inject({
      method: 'POST', url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'Idem Test Account', kind: 'bank', initialBalanceCents: 100000 },
    });
    const accountId = accRes.json().id;

    const catRes = await app.inject({
      method: 'POST', url: '/categories',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'Idem Test Category', kind: 'expense' },
    });
    const categoryId = catRes.json().id;

    const idempotencyKey = 'test-key-' + Date.now();
    const payload = { description: 'Concurrent test', amountCents: 5000, categoryId, accountId, date: '2026-07-29' };
    const headers = { 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': idempotencyKey };

    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        app.inject({ method: 'POST', url: EXPENSE_URL, headers, payload }),
      ),
    );

    for (const response of responses) {
      expect([200, 201]).toContain(response.statusCode);
    }
    const transactionIds = new Set(responses.map((response) => response.json().id));
    expect(transactionIds).toHaveLength(1);

    const list = await app.inject({
      method: 'GET', url: `/transactions?accountId=${accountId}`,
      headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() },
    });
    const matching = list.json().items.filter((t: { description: string }) => t.description === 'Concurrent test');
    expect(matching).toHaveLength(1);
  });
});

describe('0.4.2 — idempotency key collision: different payload → conflict', () => {
  let app: ReturnType<typeof buildTestApp>['app'];
  beforeEach(() => { app = buildTestApp().app; });

  it('different payload with same key returns conflict or replay', async () => {
    const accRes = await app.inject({
      method: 'POST', url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'Conflict Account', kind: 'bank', initialBalanceCents: 100000 },
    });
    const accountId = accRes.json().id;

    const catRes = await app.inject({
      method: 'POST', url: '/categories',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'Conflict Category', kind: 'expense' },
    });
    const categoryId = catRes.json().id;

    const key = 'conflict-key-' + Date.now();

    const r1 = await app.inject({
      method: 'POST', url: EXPENSE_URL,
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': key },
      payload: { description: 'First', amountCents: 1000, categoryId, accountId, date: '2026-07-29' },
    });
    expect(r1.statusCode).toBe(201);

    const r2 = await app.inject({
      method: 'POST', url: EXPENSE_URL,
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': key },
      payload: { description: 'Second', amountCents: 2000, categoryId, accountId, date: '2026-07-29' },
    });
    expect([200, 409]).toContain(r2.statusCode);
  });
});
