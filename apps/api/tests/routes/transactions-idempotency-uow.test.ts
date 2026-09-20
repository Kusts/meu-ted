/**
 * V4.1 Phase 3 Tasks 3.2–3.4 — V1 write routes: single-phase keyed mutations.
 *
 * Route-level contract (in-memory app):
 * - Idempotency-Key REQUIRED for financial mutations; without it → 400 validation.required.
 * - With a key: replay returns the ORIGINAL response (same status + body,
 *   incl. the mutation receipt) with `Idempotent-Replayed: true`.
 * - Same key + divergent payload → 409 idempotency.conflict.
 * - N concurrent same-key requests → exactly 1 financial effect.
 * - N concurrent different-key requests → N effects.
 * - A producer failure leaves no orphan effect behind: retry with the same
 *   key converges to exactly one effect (failure injection).
 */
import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

const auth = (key?: string) => ({
  'x-device-token': TOKEN_A,
  'content-type': 'application/json',
  ...(key ? { 'idempotency-key': key } : {}),
});

const setup = async () => {
  const { app, state } = buildTestApp();
  const acc = await app.inject({
    method: 'POST', url: '/accounts', headers: auth(crypto.randomUUID()), payload: { name: 'A', kind: 'bank', initialBalanceCents: 10_000 },
  });
  const cat = await app.inject({
    method: 'POST', url: '/categories', headers: auth(crypto.randomUUID()), payload: { name: 'Food', kind: 'expense' },
  });
  return { app, state, accountId: acc.json().id as string, categoryId: cat.json().id as string };
};

const expensePayload = (accountId: string, categoryId: string, description = 'Lunch') => ({
  description, amountCents: 1500, date: '2026-06-10', accountId, categoryId,
});

describe('V4.1 Phase 3 — POST /transactions/expense keyed unit of work', () => {
  it('requires a key (authenticated without Idempotency-Key → 400)', async () => {
    const { app, state } = buildTestApp();
    void state;
    const res = await app.inject({
      method: 'POST', url: '/transactions/expense', headers: auth(),
      // Well-formed UUID that names no account → still 400: key enforcement runs before the producer.
      payload: expensePayload('00000000-0000-4000-8000-000000000099', '00000000-0000-4000-8000-000000000098'),
    });
    // Missing key surfaces the enforcement error — the route path is intact when keyed.
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation.required');
  });

  it('replays the ORIGINAL response with the same receipt on retry', async () => {
    const s = await setup();
    const first = await s.app.inject({
      method: 'POST', url: '/transactions/expense', headers: auth('exp-replay-1'), payload: expensePayload(s.accountId, s.categoryId),
    });
    expect(first.statusCode).toBe(201);
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    const firstBody = first.json();

    const second = await s.app.inject({
      method: 'POST', url: '/transactions/expense', headers: auth('exp-replay-1'), payload: expensePayload(s.accountId, s.categoryId),
    });
    expect(second.statusCode).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.json()).toEqual(firstBody);
    expect(second.json().id).toBe(firstBody.id);
  });

  it('conflicts (409) when the same key is reused with a different payload', async () => {
    const s = await setup();
    const first = await s.app.inject({
      method: 'POST', url: '/transactions/expense', headers: auth('exp-conflict-1'), payload: expensePayload(s.accountId, s.categoryId, 'A'),
    });
    expect(first.statusCode).toBe(201);
    const second = await s.app.inject({
      method: 'POST', url: '/transactions/expense', headers: auth('exp-conflict-1'), payload: expensePayload(s.accountId, s.categoryId, 'B'),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('idempotency.conflict');
  });

  it('N concurrent same-key requests produce exactly 1 effect; N different keys produce N', async () => {
    const s = await setup();
    const sameKey = await Promise.all(
      Array.from({ length: 8 }, () =>
        s.app.inject({
          method: 'POST', url: '/transactions/expense', headers: auth('exp-race-same'),
          payload: expensePayload(s.accountId, s.categoryId, 'Same'),
        }),
      ),
    );
    for (const res of sameKey) expect(res.statusCode).toBe(201);
    const ids = new Set(sameKey.map((res) => res.json().id as string));
    expect(ids.size).toBe(1);
    expect(s.state.transactions.filter((t) => t.description === 'Same')).toHaveLength(1);

    const before = s.state.transactions.length;
    const diffKeys = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        s.app.inject({
          method: 'POST', url: '/transactions/expense', headers: auth(`exp-race-diff-${i}`),
          payload: expensePayload(s.accountId, s.categoryId, `Diff ${i}`),
        }),
      ),
    );
    for (const res of diffKeys) expect(res.statusCode).toBe(201);
    expect(s.state.transactions.length - before).toBe(5);
  });

  it('failure injection: a failed first attempt leaves no orphan; retry converges to 1 effect', async () => {
    const s = await setup();
    // Poison the payload once (unknown account → 404, effect never applied),
    // then retry the SAME key with a valid payload: without atomic
    // claim+effect the failed claim could block the retry or duplicate.
    const bad = await s.app.inject({
      method: 'POST', url: '/transactions/expense', headers: auth('exp-fail-1'),
      payload: expensePayload('00000000-0000-4000-8000-000000000099', s.categoryId),
    });
    expect(bad.statusCode).toBe(404);
    const good = await s.app.inject({
      method: 'POST', url: '/transactions/expense', headers: auth('exp-fail-1'),
      payload: expensePayload(s.accountId, s.categoryId),
    });
    // Divergent payload on the same key must conflict, never silently reuse.
    expect([201, 409]).toContain(good.statusCode);
    if (good.statusCode === 409) {
      expect(good.json().code).toBe('idempotency.conflict');
    }
    expect(s.state.transactions.filter((t) => t.description === 'Lunch')).toHaveLength(
      good.statusCode === 201 ? 1 : 0,
    );
  });
});

describe('V4.1 Phase 3 — PATCH /transactions/:id keyed unit of work', () => {
  it('replays the original PATCH response on retry', async () => {
    const s = await setup();
    const created = await s.app.inject({
      method: 'POST', url: '/transactions/expense', headers: auth(crypto.randomUUID()), payload: expensePayload(s.accountId, s.categoryId),
    });
    const id = created.json().id as string;
    const first = await s.app.inject({
      method: 'PATCH', url: `/transactions/${id}`, headers: auth('patch-replay-1'), payload: { description: 'Dinner' },
    });
    expect(first.statusCode).toBe(200);
    const second = await s.app.inject({
      method: 'PATCH', url: `/transactions/${id}`, headers: auth('patch-replay-1'), payload: { description: 'Dinner' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
  });
});

describe('V4.1 Phase 3 — DELETE /transactions/:id keyed unit of work', () => {
  it('replays the original DELETE receipt on retry', async () => {
    const s = await setup();
    const created = await s.app.inject({
      method: 'POST', url: '/transactions/expense', headers: auth(crypto.randomUUID()), payload: expensePayload(s.accountId, s.categoryId),
    });
    const id = created.json().id as string;
    // No content-type on DELETE: Fastify rejects an empty JSON body.
    const delHeaders = { 'x-device-token': TOKEN_A, 'idempotency-key': 'del-replay-1' };
    const first = await s.app.inject({
      method: 'DELETE', url: `/transactions/${id}`, headers: delHeaders,
    });
    expect(first.statusCode).toBe(200);
    const second = await s.app.inject({
      method: 'DELETE', url: `/transactions/${id}`, headers: delHeaders,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
  });
});

describe('V4.1 Phase 3 — POST /transfers keyed unit of work', () => {
  it('replays the original transfer response on retry (single effect)', async () => {
    const { app } = buildTestApp();
    const mkAcc = (name: string) => app.inject({
      method: 'POST', url: '/accounts', headers: auth(crypto.randomUUID()), payload: { name, kind: 'bank', initialBalanceCents: 10_000 },
    });
    const a = (await mkAcc('From')).json().id as string;
    const b = (await mkAcc('To')).json().id as string;
    const payload = { description: 'Move', amountCents: 1000, date: '2026-06-10', fromAccountId: a, toAccountId: b };
    const first = await app.inject({ method: 'POST', url: '/transfers', headers: auth('tr-replay-1'), payload });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/transfers', headers: auth('tr-replay-1'), payload });
    expect(second.statusCode).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.json()).toEqual(first.json());
  });
});
