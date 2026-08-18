import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';
import { createBetterAuth, getBetterAuthSessionContext } from '../../src/auth/better-auth.js';

describe('Better Auth request context', () => {
  it('maps a valid session cookie to a stable human identity context', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });

    const signUp = await auth.api.signUpEmail({
      body: { email: 'context@example.com', password: 'test-password-123', name: 'Context' },
      headers: new Headers({ origin: 'http://localhost:3000' }),
      asResponse: true,
    });
    const cookie = signUp.headers.get('set-cookie');
    const context = await getBetterAuthSessionContext(auth, new Headers({ cookie: cookie ?? '' }));

    expect(context?.userId).toBeTypeOf('string');
    expect(context?.sessionId).toBeTypeOf('string');
    expect(context?.email).toBe('context@example.com');
    await auth.close();
  });
});
