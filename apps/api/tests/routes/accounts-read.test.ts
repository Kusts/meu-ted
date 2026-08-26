import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

const auth = { 'x-device-token': TOKEN_A };

describe('GET /accounts/:id', () => {
  it('returns only the requested account and its balance', async () => {
    const { app } = buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/accounts',
      headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      payload: { name: 'Specific', kind: 'cash', initialBalanceCents: 1234 },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/accounts/${created.json().id}`,
      headers: auth,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: created.json().id, name: 'Specific', balanceCents: 1234 });
  });

  it('does not expose an account from another household', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/accounts/00000000-0000-0000-0000-000000000000',
      headers: auth,
    });

    expect(response.statusCode).toBe(404);
  });
});
