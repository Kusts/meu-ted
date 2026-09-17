/**
 * DEBT-CODER-BULKTX (RED) — bulk payable effects must be all-or-nothing.
 *
 * `autoCreateFromTemplates` fans one bulk call out into N per-row
 * `createPayableFromTemplate` inserts. Today each row commits in its own
 * transaction, so a mid-batch failure leaves partial effects behind.
 * These tests pin the required behavior:
 *  (a) a 3rd-row failure rolls back rows 1–2 (ZERO payables persisted);
 *  (b) a same-key replay of a completed bulk returns the SAME response
 *      without duplicating rows.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createInMemoryPayableStore } from '../../src/payables/in-memory.js';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';

const dayOfMonth = new Date().getUTCDate();

const seedTemplates = async (store: ReturnType<typeof createInMemoryPayableStore>, accountId: string, prefix: string) => {
  for (const n of [1, 2, 3]) {
    await store.createTemplate(HOUSEHOLD_A, {
      accountId,
      name: `${prefix}-tpl-${n}`,
      description: `${prefix}-desc-${n}`,
      amountCents: 1000 + n,
      frequency: 'monthly',
      dayOfMonth,
    });
  }
};

describe('bulk payable atomicity (in-memory twin)', () => {
  it('(a) a 3rd-row failure persists ZERO payables (all-or-nothing)', async () => {
    const { state } = createInMemoryStores({});
    const store = createInMemoryPayableStore(state);
    const accountId = randomUUID();
    await seedTemplates(store, accountId, `atomic-${randomUUID()}`);

    let calls = 0;
    const orig = store.createPayableFromTemplate.bind(store);
    store.createPayableFromTemplate = (async (...args: Parameters<typeof orig>) => {
      calls += 1;
      if (calls === 3) throw new Error('boom-3rd-row');
      return orig(...args);
    }) as typeof store.createPayableFromTemplate;

    await expect(store.autoCreateFromTemplates(HOUSEHOLD_A, 30)).rejects.toThrow('boom-3rd-row');
    expect(await store.listPayables(HOUSEHOLD_A)).toHaveLength(0);
  });

  it('(b) same-key replay of a completed bulk returns the same response with no duplicate rows', async () => {
    const { app } = buildTestApp();
    const account = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'Bulk A', kind: 'bank', initialBalanceCents: 50_000 },
    });
    expect(account.statusCode).toBe(201);
    const accountId = account.json().id as string;
    const tag = `replay-${randomUUID()}`;
    const tpl = await app.inject({
      method: 'POST',
      url: '/payables/templates',
      headers: { 'x-device-token': TOKEN_A },
      payload: {
        accountId,
        name: `${tag}-tpl`,
        description: `${tag}-desc`,
        amountCents: 9000,
        frequency: 'monthly',
        dayOfMonth,
      },
    });
    expect(tpl.statusCode).toBe(201);

    const headers = { 'x-device-token': TOKEN_A, 'idempotency-key': `bulk-${tag}` };
    const first = await app.inject({
      method: 'POST',
      url: '/payables/auto-create-from-templates?daysAhead=30',
      headers,
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: 'POST',
      url: '/payables/auto-create-from-templates?daysAhead=30',
      headers,
    });
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(second.headers['idempotent-replayed']).toBe('true');

    const listed = await app.inject({
      method: 'GET',
      url: '/payables?status=pending',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(
      listed.json().items.filter((item: { description: string }) => item.description === `${tag}-desc`),
    ).toHaveLength(1);
  });
});
