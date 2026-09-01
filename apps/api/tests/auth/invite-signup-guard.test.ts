import { describe, expect, it, vi } from 'vitest';
import { createPostgresInviteSignupGuard } from '../../src/auth/invite-signup-guard.js';
import type { Pool } from 'pg';

describe('invite signup guard', () => {
  it('returns true when a pending invite exists for the normalized email', async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [{ count: '1' }], rowCount: 1 })),
    } as unknown as Pool;
    const guard = createPostgresInviteSignupGuard(pool);
    await expect(guard('  MEMBER@Example.COM  ')).resolves.toBe(true);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('email_normalized'), ['member@example.com']);
  });

  it('returns false when no pending invite exists', async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [{ count: '0' }], rowCount: 1 })),
    } as unknown as Pool;
    const guard = createPostgresInviteSignupGuard(pool);
    await expect(guard('unknown@example.com')).resolves.toBe(false);
  });

  it('returns false for invalid email', async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [{ count: '0' }], rowCount: 1 })),
    } as unknown as Pool;
    const guard = createPostgresInviteSignupGuard(pool);
    await expect(guard('not-an-email')).resolves.toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('blocks signup via HTTP when guard returns false', async () => {
    const { default: Fastify } = await import('fastify');
    const { memoryAdapter } = await import('better-auth/adapters/memory');
    const { createBetterAuth } = await import('../../src/auth/better-auth.js');
    const { registerBetterAuthRoutes } = await import('../../src/auth/better-auth-http.js');

    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });

    const app = Fastify({ logger: false });
    const guard = vi.fn(async (email: string) => email === 'invited@example.com');
    registerBetterAuthRoutes(app, auth, undefined, undefined, guard);

    const withoutInvite = await app.inject({
      method: 'POST',
      url: '/auth/sign-up/email',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: { email: 'stranger@example.com', password: 'password123!', name: 'Stranger' },
    });
    expect(withoutInvite.statusCode).toBe(403);
    expect(withoutInvite.json().code).toBe('auth.signup_requires_invite');
    expect(withoutInvite.json().message).toMatch(/convite pendente/);
    expect(guard).toHaveBeenCalledWith('stranger@example.com');

    const withInvite = await app.inject({
      method: 'POST',
      url: '/auth/sign-up/email',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: { email: 'invited@example.com', password: 'password123!', name: 'Invited' },
    });
    // invited email passes guard and reaches better-auth; should succeed (200) or be handled by better-auth
    expect([200, 201]).toContain(withInvite.statusCode);

    await app.close();
    await auth.close();
  });
});
