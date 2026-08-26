import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';
import { createBetterAuth } from '../../src/auth/better-auth.js';
import { buildTestApp } from '../test-app.js';

describe('Better Auth API composition', () => {
  it('mounts the session handler without disabling legacy device-token registration guards', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });
    const { app } = buildTestApp({}, undefined, undefined, auth);

    const signUp = await app.inject({
      method: 'POST',
      url: '/auth/sign-up/email',
      headers: { origin: 'http://localhost:3000' },
      payload: { email: 'composed@example.com', password: 'test-password-123', name: 'Composed' },
    });
    const registration = await app.inject({ method: 'POST', url: '/auth/devices/register', payload: { deviceName: 'blocked' } });

    expect(signUp.statusCode).toBe(200);
    expect(registration.statusCode).toBe(403);
    await app.close();
    await auth.close();
  });
});
