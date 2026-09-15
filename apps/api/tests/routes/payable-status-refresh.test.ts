import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import { ACCOUNT_A1 } from '../fixtures/seed.js';

describe('POST /payables/refresh-status', () => {
  it('marks overdue payables for the authenticated workspace', async () => {
    const { app } = buildTestApp({ accounts: [ACCOUNT_A1], categories: [], transactions: [] });
    const created = await app.inject({
      method: 'POST',
      url: '/payables',
      headers: { 'x-device-token': TOKEN_A },
      payload: { accountId: ACCOUNT_A1.id, description: 'Vencida', amountCents: 1000, dueDate: '2020-01-01' },
    });
    expect(created.statusCode).toBe(201);

    const refreshed = await app.inject({
      method: 'POST',
      url: '/payables/refresh-status',
      headers: { 'x-device-token': TOKEN_A, 'idempotency-key': 'status-refresh-1' },
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json()).toMatchObject({ updated: [{ description: 'Vencida', status: 'overdue' }] });
  });
});
