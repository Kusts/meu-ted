import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';
import { createBetterAuth } from '../../src/auth/better-auth.js';

describe('Better Auth integration', () => {
  it('creates a server auth handler with explicit origin and secret configuration', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });

    expect(auth.handler).toBeTypeOf('function');
    expect(auth.options.baseURL).toBe('http://localhost:3001');
    expect(auth.options.trustedOrigins).toEqual(['http://localhost:3000']);
    expect(auth.options.advanced?.disableCSRFCheck).toBe(false);
    expect(auth.options.advanced?.defaultCookieAttributes).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: false });
    await auth.close();
  });

  it('uses a cross-site cookie contract for the HTTPS production API', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'https://api.synkroo.com.br',
      trustedOrigins: ['https://pwa.example'],
    });

    expect(auth.options.advanced?.defaultCookieAttributes).toMatchObject({
      httpOnly: true,
      sameSite: 'none',
      secure: true,
    });
    await auth.close();
  });

  it('disables public signup unless explicitly enabled', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });

    expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
    await auth.close();
  });

  it('revokes a server session on sign-out', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });

    const signUp = await auth.api.signUpEmail({
      body: { email: 'revoke@example.com', password: 'test-password-123', name: 'Revoke' },
      headers: new Headers({ origin: 'http://localhost:3000' }),
      asResponse: true,
    });
    const cookie = signUp.headers.get('set-cookie') ?? '';
    const signOut = await auth.api.signOut({ headers: new Headers({ cookie }), asResponse: true });
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });

    expect(signOut.status).toBe(200);
    expect(session).toBeNull();
    await auth.close();
  });

  it('creates a session that can be resolved from the Better Auth cookie', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });

    const response = await auth.api.signUpEmail({
      body: { email: 'owner@example.com', password: 'test-password-123', name: 'Owner' },
      headers: new Headers({ origin: 'http://localhost:3000' }),
      asResponse: true,
    });
    const cookie = response.headers.get('set-cookie');
    expect(response.status).toBe(200);
    expect(cookie).toContain('better-auth.session_token=');

    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookie ?? '' }) });
    expect(session?.user.email).toBe('owner@example.com');
    expect(session?.session.token).toBeTypeOf('string');
    await auth.close();
  });
});
