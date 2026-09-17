import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

const auth = () => ({ 'x-device-token': TOKEN_A, 'content-type': 'application/json' });

/**
 * V4.1 REVIEWFIX F2 [major] — unpay requires paidTransactionId (D4).
 *
 * The route contract carries the linked paidTransactionId; a caller that
 * does not present it is rejected (4xx) instead of reversing an unverified
 * financial effect. A mismatch is still 409.
 */
const seedPaidPayable = async (app: ReturnType<typeof buildTestApp>['app']) => {
  const account = await app.inject({
    method: 'POST', url: '/accounts', headers: auth(),
    payload: { name: 'Unpay Req', kind: 'bank', initialBalanceCents: 50_000 },
  });
  const payable = await app.inject({
    method: 'POST', url: '/payables', headers: auth(),
    payload: {
      accountId: account.json().id, description: 'Aluguel',
      amountCents: 10_000, dueDate: '2026-06-15',
    },
  });
  const payableId = payable.json().id as string;
  const pay = await app.inject({
    method: 'POST', url: `/payables/${payableId}/pay`, headers: auth(), payload: { paidDate: '2026-06-14' },
  });
  return { payableId, paidTransactionId: pay.json().paidTransactionId as string };
};

describe('V4.1 REVIEWFIX F2 — unpay requires paidTransactionId', () => {
  it('unpay without paidTransactionId → 4xx (contract violation, no reversal)', async () => {
    const { app, state } = buildTestApp();
    const { payableId } = await seedPaidPayable(app);

    const res = await app.inject({
      method: 'POST', url: `/payables/${payableId}/unpay`, headers: auth(), payload: {},
    });

    expect([400, 422]).toContain(res.statusCode);
    // No reversal happened: the payable is still paid.
    const listed = await app.inject({ method: 'GET', url: '/payables?status=paid', headers: auth() });
    expect((listed.json().items as unknown[])).toHaveLength(1);
    expect(state.transactions.filter((t) => t.amountCents === 10_000)).toHaveLength(1);
  });

  it('unpay with the linked paidTransactionId → 200 (control)', async () => {
    const { app } = buildTestApp();
    const { payableId, paidTransactionId } = await seedPaidPayable(app);

    const res = await app.inject({
      method: 'POST', url: `/payables/${payableId}/unpay`, headers: auth(),
      payload: { paidTransactionId },
    });

    expect(res.statusCode).toBe(200);
    expect(['pending', 'overdue']).toContain(res.json().status);
  });

  it('unpay with a mismatched paidTransactionId → 409 (control)', async () => {
    const { app } = buildTestApp();
    const { payableId } = await seedPaidPayable(app);

    const res = await app.inject({
      method: 'POST', url: `/payables/${payableId}/unpay`, headers: auth(),
      payload: { paidTransactionId: crypto.randomUUID() },
    });

    expect(res.statusCode).toBe(409);
  });
});
