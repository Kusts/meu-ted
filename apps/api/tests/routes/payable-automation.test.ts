import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import { ACCOUNT_A1, ACCOUNT_B1 } from '../fixtures/seed.js';

describe('POST /payables/auto-create-from-templates', () => {
  it('creates due template payables only for the authenticated workspace', async () => {
    const { app } = buildTestApp({
      accounts: [ACCOUNT_A1, ACCOUNT_B1],
      categories: [],
      transactions: [],
    });
    const dayOfMonth = new Date().getUTCDate();

    const template = await app.inject({
      method: 'POST',
      url: '/payables/templates',
      headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() },
      payload: {
        accountId: ACCOUNT_A1.id,
        name: 'Internet',
        description: 'Internet mensal',
        amountCents: 9990,
        frequency: 'monthly',
        dayOfMonth,
      },
    });
    expect(template.statusCode).toBe(201);

    const created = await app.inject({
      method: 'POST',
      url: '/payables/auto-create-from-templates?daysAhead=0',
      headers: { 'x-device-token': TOKEN_A, 'idempotency-key': 'automation-auto-1' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ created: [{ description: 'Internet mensal', amountCents: 9990 }] });

    const otherWorkspace = await app.inject({
      method: 'POST',
      url: '/payables/auto-create-from-templates?daysAhead=0',
      headers: { 'x-device-token': TOKEN_B, 'idempotency-key': 'automation-auto-2' },
    });
    expect(otherWorkspace.statusCode).toBe(201);
    expect(otherWorkspace.json()).toMatchObject({ created: [] });
  });
});
