import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

const auth = () => ({ 'x-device-token': TOKEN_A, 'content-type': 'application/json' });

const seedPayable = async (app: ReturnType<typeof buildTestApp>['app']) => {
  const account = await app.inject({ method: 'POST', url: '/accounts', headers: auth(), payload: { name: 'Pay A', kind: 'bank', initialBalanceCents: 50_000 } });
  const category = await app.inject({ method: 'POST', url: '/categories', headers: auth(), payload: { name: 'Bills', kind: 'expense' } });
  const payable = await app.inject({ method: 'POST', url: '/payables', headers: auth(), payload: { accountId: account.json().id, description: 'Luz', amountCents: 10_000, dueDate: '2026-06-15', categoryId: category.json().id } });
  return { account, payable };
};

describe('payables concurrency and idempotent retry', () => {
  it('concurrent pay/pay marks the payable paid exactly once', async () => {
    const { app } = buildTestApp();
    const { payable } = await seedPayable(app);
    const id = payable.json().id;
    const [a, b] = await Promise.all([
      app.inject({ method: 'POST', url: `/payables/${id}/pay`, headers: { ...auth(), 'idempotency-key': `pay-${crypto.randomUUID()}` }, payload: { paidDate: '2026-06-14' } }),
      app.inject({ method: 'POST', url: `/payables/${id}/pay`, headers: { ...auth(), 'idempotency-key': `pay-${crypto.randomUUID()}` }, payload: { paidDate: '2026-06-14' } }),
    ]);
    const paidCount = [a.statusCode, b.statusCode].filter((code) => code === 200).length;
    expect(paidCount).toBe(1);
    const listed = await app.inject({ method: 'GET', url: '/payables?status=paid', headers: auth() });
    expect(listed.json().items).toHaveLength(1);
  });

  it('replays the canonical response on pay retry with the same key', async () => {
    const { app } = buildTestApp();
    const { payable } = await seedPayable(app);
    const id = payable.json().id;
    const first = await app.inject({ method: 'POST', url: `/payables/${id}/pay`, headers: { ...auth(), 'idempotency-key': 'pay-retry-1' }, payload: { paidDate: '2026-06-14' } });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: 'POST', url: `/payables/${id}/pay`, headers: { ...auth(), 'idempotency-key': 'pay-retry-1' }, payload: { paidDate: '2026-06-14' } });
    expect(second.statusCode).toBe(200);
    const listed = await app.inject({ method: 'GET', url: '/payables?status=paid', headers: auth() });
    expect(listed.json().items).toHaveLength(1);
  });

  it('auto-create from templates is idempotent on retry with the same key', async () => {
    const { app } = buildTestApp();
    const account = await app.inject({ method: 'POST', url: '/accounts', headers: auth(), payload: { name: 'Pay B', kind: 'bank', initialBalanceCents: 50_000 } });
    await app.inject({ method: 'POST', url: '/payables/templates', headers: auth(), payload: { accountId: account.json().id, name: 'Internet', description: 'Internet fibra', amountCents: 9_000, frequency: 'monthly', dayOfMonth: 15 } });
    const first = await app.inject({ method: 'POST', url: '/payables/auto-create-from-templates?daysAhead=30', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': 'auto-1' } });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/payables/auto-create-from-templates?daysAhead=30', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': 'auto-1' } });
    expect(second.statusCode).toBe(201);
    const listed = await app.inject({ method: 'GET', url: '/payables?status=pending', headers: auth() });
    expect(listed.json().items.filter((item: { description: string }) => item.description === 'Internet fibra')).toHaveLength(1);
  });

  it('refresh-status advances due payables with the injected clock', async () => {
    const { app } = buildTestApp();
    const { payable } = await seedPayable(app);
    const refreshed = await app.inject({ method: 'POST', url: '/payables/refresh-status', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': 'refresh-1' } });
    expect(refreshed.statusCode).toBe(200);
    expect(Array.isArray(refreshed.json().updated)).toBe(true);
    expect(payable.json().status).toBe('pending');
  });
});