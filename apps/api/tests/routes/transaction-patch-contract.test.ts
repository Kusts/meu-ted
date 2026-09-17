import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import { updateTransactionInputSchema } from '../../src/writes/types.js';
import { ACCOUNT_A1, CATEGORY_FOOD_A } from '../fixtures/seed.js';

const seed = () => ({ accounts: [{ ...ACCOUNT_A1 }], categories: [{ ...CATEGORY_FOOD_A }], transactions: [] as never[] });
const isoDate = '2026-09-10';

const setupExpense = async () => {
  const { app } = buildTestApp(seed());
  const s = await app.inject({
    method: 'POST', url: '/transactions/expense',
    headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
    payload: {
      description: 'Base', amountCents: 1000, date: isoDate,
      accountId: ACCOUNT_A1.id, categoryId: CATEGORY_FOOD_A.id,
    },
  });
  expect(s.statusCode).toBe(201);
  return { app, id: s.json().id as string };
};

// V4.1 tasks 2.12/2.13 — SPEC §9.7: supported → validate + apply,
// unsupported/unknown → 422. Never 200 + silently ignored.
describe('V4.1 transaction PATCH contract (SPEC §9.7)', () => {
  it('schema rejects unknown keys', () => {
    const parsed = updateTransactionInputSchema.safeParse({ description: 'Ok', bogusField: 123 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it('PATCH with an unknown field returns 422 and applies nothing', async () => {
    const { app, id } = await setupExpense();
    const res = await app.inject({
      method: 'PATCH', url: `/transactions/${id}`,
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { description: 'Tentativa', hackerField: 'ignored' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.unknown_fields');
    const list = await app.inject({ method: 'GET', url: '/transactions', headers: { 'x-device-token': TOKEN_A } });
    expect(list.json().items.find((t: { id: string }) => t.id === id).description).toBe('Base');
  });

  it('PATCH transfer with an unknown field returns 422', async () => {
    const { app } = buildTestApp(seed());
    const a = await app.inject({
      method: 'POST', url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'A', kind: 'bank', initialBalanceCents: 0 },
    });
    const b = await app.inject({
      method: 'POST', url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'B', kind: 'cash', initialBalanceCents: 0 },
    });
    const tx = await app.inject({
      method: 'POST', url: '/transfers',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: {
        description: 'X', amountCents: 100, date: isoDate,
        fromAccountId: a.json().id, toAccountId: b.json().id,
      },
    });
    const res = await app.inject({
      method: 'PATCH', url: `/transactions/${tx.json().id}`,
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { description: 'Y', unknownField: true },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('validation.unknown_fields');
  });

  it('PATCH transfer with a restricted known field returns 422 (unsupported)', async () => {
    const { app } = buildTestApp(seed());
    const a = await app.inject({
      method: 'POST', url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'A', kind: 'bank', initialBalanceCents: 0 },
    });
    const b = await app.inject({
      method: 'POST', url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'B', kind: 'cash', initialBalanceCents: 0 },
    });
    const tx = await app.inject({
      method: 'POST', url: '/transfers',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: {
        description: 'X', amountCents: 100, date: isoDate,
        fromAccountId: a.json().id, toAccountId: b.json().id,
      },
    });
    const res = await app.inject({
      method: 'PATCH', url: `/transactions/${tx.json().id}`,
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { amountCents: 200 },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('unsupported');
  });

  // Snapshot: every supported expense/income field keeps working.
  it.each([
    ['description', { description: 'Nova' }, 'description', 'Nova'],
    ['date', { date: '2026-09-11' }, 'date', '2026-09-11'],
    ['amountCents', { amountCents: 2500 }, 'amountCents', 2500],
    ['notes', { notes: 'nota patch' }, 'notes', 'nota patch'],
  ] as const)('PATCH applies supported field %s on expense', async (_name, payload, key, expected) => {
    const { app, id } = await setupExpense();
    const res = await app.inject({
      method: 'PATCH', url: `/transactions/${id}`,
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()[key]).toBe(expected);
  });

  it('PATCH applies accountId + categoryId on expense', async () => {
    const { app, id } = await setupExpense();
    const acc = await app.inject({
      method: 'POST', url: '/accounts',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'Nova conta', kind: 'cash', initialBalanceCents: 0 },
    });
    const cat = await app.inject({
      method: 'POST', url: '/categories',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'Nova cat', kind: 'expense' },
    });
    const res = await app.inject({
      method: 'PATCH', url: `/transactions/${id}`,
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { accountId: acc.json().id, categoryId: cat.json().id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accountId).toBe(acc.json().id);
    expect(res.json().categoryId).toBe(cat.json().id);
  });
});
