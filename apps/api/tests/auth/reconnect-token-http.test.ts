import Fastify from 'fastify';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';
import { createBetterAuth } from '../../src/auth/better-auth.js';
import { registerBetterAuthRoutes } from '../../src/auth/better-auth-http.js';
import { createReconnectTokenStore } from '../../src/auth/reconnect-tokens.js';

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = response.headers['set-cookie'];
  return Array.isArray(value) ? value.join('; ') : String(value ?? '');
}

describe('reconnect token HTTP boundary', () => {
  it('issues a session-bound token and invalidates it on logout', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });
    const tokens = createReconnectTokenStore();
    const app = Fastify({ logger: false });
    registerBetterAuthRoutes(app, auth, tokens);
    await app.ready();

    const signedIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-up/email',
      headers: { origin: 'http://localhost:3000' },
      payload: { email: 'token@example.com', password: 'password-123', name: 'Token User' },
    });
    const cookie = cookieFrom(signedIn);
    const issued = await app.inject({ method: 'POST', url: '/auth/reconnect-token', headers: { cookie, origin: 'http://localhost:3000' } });
    expect(issued.statusCode).toBe(200);
    const token = issued.json().token as string;
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session).not.toBeNull();
    expect(tokens.validate(token, session!.session.id)).toBe(true);
    const reconnect = await app.inject({ method: 'POST', url: '/auth/reconnect', headers: { origin: 'http://localhost:3000' }, payload: { token } });
    expect(reconnect.statusCode).toBe(200);
    expect(reconnect.json().sessionId).toBe(session!.session.id);

    const logout = await app.inject({ method: 'POST', url: '/auth/sign-out', headers: { cookie, origin: 'http://localhost:3000' } });
    expect(logout.statusCode).toBe(200);
    expect(tokens.validate(token, session!.session.id)).toBe(false);
    const rejectedReconnect = await app.inject({ method: 'POST', url: '/auth/reconnect', headers: { origin: 'http://localhost:3000' }, payload: { token } });
    expect(rejectedReconnect.statusCode).toBe(401);
    await app.close();
    await auth.close();
  });
});
