import { once } from 'node:events';
import { connect } from 'node:net';
import Fastify from 'fastify';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { afterEach, describe, expect, it } from 'vitest';
import { createBetterAuth } from '../../src/auth/better-auth.js';
import { registerBetterAuthRoutes } from '../../src/auth/better-auth-http.js';
import { createReconnectSocketRegistry } from '../../src/auth/reconnect-sockets.js';
import { createReconnectTokenStore } from '../../src/auth/reconnect-tokens.js';

const cookieValue = (headers: Record<string, unknown>): string => {
  const cookie = headers['set-cookie'];
  return Array.isArray(cookie) ? cookie.join('; ') : String(cookie ?? '');
};

describe('production reconnect logout path', () => {
  let app: ReturnType<typeof Fastify> | undefined;
  let auth: ReturnType<typeof createBetterAuth> | undefined;

  afterEach(async () => {
    await app?.close();
    await auth?.close();
    app = undefined;
    auth = undefined;
  });

  it('closes an upgraded socket when the authenticated session logs out', async () => {
    auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });
    const tokens = createReconnectTokenStore();
    app = Fastify({ logger: false });
    const sockets = createReconnectSocketRegistry(app.server, tokens);
    registerBetterAuthRoutes(app, auth, tokens, sockets);
    const signedIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-up/email',
      headers: { origin: 'http://localhost:3000' },
      payload: { email: 'socket-logout@example.com', password: 'password-123', name: 'Socket Logout' },
    });
    const cookie = cookieValue(signedIn.headers);
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    const tokenResponse = await app.inject({ method: 'POST', url: '/auth/reconnect-token', headers: { cookie, origin: 'http://localhost:3000' } });
    const token = tokenResponse.json().token as string;
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as { port: number }).port;
    const client = connect(port, '127.0.0.1');
    await once(client, 'connect');
    client.write(`GET /auth/reconnect-ws?reconnect_token=${token} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: Y2xpZW50LWtleQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    const [upgrade] = await once(client, 'data');
    expect(String(upgrade)).toContain('101 Switching Protocols');
    expect(sockets.activeSessionCount()).toBe(1);

    const socketClosed = once(client, 'close');
    client.on('error', () => undefined);
    const logout = await app.inject({ method: 'POST', url: '/auth/sign-out', headers: { cookie, origin: 'http://localhost:3000' } });
    expect(logout.statusCode).toBe(200);
    expect(tokens.validate(token, session!.session.id)).toBe(false);
    await socketClosed;
    expect(sockets.activeSessionCount()).toBe(0);
  });
});
