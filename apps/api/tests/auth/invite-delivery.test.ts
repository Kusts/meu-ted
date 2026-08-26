import { describe, expect, it } from 'vitest';
import { createHttpInviteDelivery } from '../../src/auth/invite-delivery.js';

describe('invite delivery adapter', () => {
  it('delivers the token to the configured endpoint without logging or persisting it', async () => {
    let request: RequestInit | undefined;
    const deliver = createHttpInviteDelivery({
      endpoint: 'https://mailer.example.test/invites',
      bearerToken: 'delivery-secret',
      fetchImpl: async (_input, init) => {
        request = init;
        return new Response(null, { status: 202 });
      },
    });

    await deliver({
      inviteId: 'invite-1',
      householdId: 'household-1',
      email: 'member@example.com',
      token: 'token-1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    expect(request?.method).toBe('POST');
    expect(request?.headers).toMatchObject({ authorization: 'Bearer delivery-secret', 'content-type': 'application/json' });
    expect(request?.body).toContain('token-1');
  });
});
