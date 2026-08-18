import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';
import { ACCOUNT_A1, ACCOUNT_B1 } from '../fixtures/seed.js';

describe('GET /accounts/:id', () => {
  it('returns the account balance only within the authenticated workspace', async () => {
    const { app } = buildTestApp({
      accounts: [ACCOUNT_A1, ACCOUNT_B1],
      categories: [],
      transactions: [],
    });

    const own = await app.inject({
      method: 'GET',
      url: `/accounts/${ACCOUNT_A1.id}`,
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(own.statusCode).toBe(200);
    expect(own.json()).toMatchObject({ id: ACCOUNT_A1.id, balanceCents: ACCOUNT_A1.balanceCents });

    const otherWorkspace = await app.inject({
      method: 'GET',
      url: `/accounts/${ACCOUNT_B1.id}`,
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(otherWorkspace.statusCode).toBe(404);

    const withoutAuth = await app.inject({ method: 'GET', url: `/accounts/${ACCOUNT_A1.id}` });
    expect(withoutAuth.statusCode).toBe(401);
  });
});
