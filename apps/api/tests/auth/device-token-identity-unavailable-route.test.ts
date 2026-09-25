import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerAuthRoutes } from '../../src/routes/auth.js';

const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';

/** Sanitized typed error the device boundary emits (Onda 1 item 1 contract). */
const sanitizedUnavailable = () =>
  Object.assign(new Error('user identity unavailable, try again later'), {
    statusCode: 503,
    code: 'auth.identity_unavailable',
  });

/** Unknown resolve/store failure carrying driver text (must never reach the client). */
const rawResolveFailure = () =>
  Object.assign(new Error('connect ECONNREFUSED 10.0.0.9:5432 - SELECT FROM device_tokens'), {
    code: 'ECONNREFUSED',
  });

const rawPostgresFailure = () =>
  Object.assign(new Error('password authentication failed for user "pi" at 10.0.0.9:5432'), {
    code: '28P01',
  });

const buildApp = (
  store: {
    register: () => Promise<never>;
    rotate: () => Promise<never>;
    revoke?: () => Promise<never>;
  },
  overrides?: {
    resolveToken?: () => Promise<{ deviceId: string; householdId: string; userId?: string | null }>;
    workspaceAccess?: { resolve: () => Promise<never> };
  },
) => {
  const app = Fastify();
  registerAuthRoutes(app, {
    resolveToken: overrides?.resolveToken ?? (async () => ({ deviceId: 'dev-1', householdId: HOUSEHOLD_ID, userId: null })),
    tokenStore: {
      resolve: async () => ({ deviceId: 'dev-1', householdId: HOUSEHOLD_ID, userId: null }),
      register: store.register,
      revoke: store.revoke ?? (async () => undefined),
      revokeAllForUserWorkspace: async () => 0,
      rotate: store.rotate,
    },
    defaultHouseholdId: HOUSEHOLD_ID,
    ...(overrides?.workspaceAccess ? { workspaceAccess: overrides.workspaceAccess } : {}),
  });
  return app;
};

describe('device identity_unavailable route sanitization (Onda 1 item 1)', () => {
  it('POST /auth/devices/register propagates typed 503 without leaking internals', async () => {
    const app = buildApp({
      register: async () => { throw sanitizedUnavailable(); },
      rotate: async () => { throw new Error('unreachable'); },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: { 'content-type': 'application/json' },
      payload: { deviceName: 'phone' },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { code?: string; message?: string };
    expect(body.code).toBe('auth.identity_unavailable');
    expect(String(body.message ?? '')).not.toContain('10.0.0.9');
    await app.close();
  });

  it('POST /auth/devices/register maps an unknown driver failure to a generic 500', async () => {
    const app = buildApp({
      register: async () => { throw rawPostgresFailure(); },
      rotate: async () => { throw new Error('unreachable'); },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: { 'content-type': 'application/json' },
      payload: { deviceName: 'phone' },
    });
    expect(res.statusCode).toBe(500);
    const body = res.json() as { code?: string; message?: string };
    expect(String(body.message ?? '')).not.toContain('10.0.0.9');
    expect(String(body.message ?? '')).not.toContain('password authentication failed');
    await app.close();
  });

  it('POST /auth/devices/rotate propagates typed 503 without leaking internals', async () => {
    const app = buildApp({
      register: async () => { throw new Error('unreachable'); },
      rotate: async () => { throw sanitizedUnavailable(); },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/rotate',
      headers: { 'content-type': 'application/json', 'x-device-token': 'pred-token' },
      payload: { deviceName: 'phone v2' },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json() as { code?: string; message?: string };
    expect(body.code).toBe('auth.identity_unavailable');
    expect(String(body.message ?? '')).not.toContain('10.0.0.9');
    await app.close();
  });

  it('POST /auth/devices/rotate maps an unknown driver failure to a generic 500', async () => {
    const app = buildApp({
      register: async () => { throw new Error('unreachable'); },
      rotate: async () => { throw rawPostgresFailure(); },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/rotate',
      headers: { 'content-type': 'application/json', 'x-device-token': 'pred-token' },
      payload: { deviceName: 'phone v2' },
    });
    expect(res.statusCode).toBe(500);
    const body = res.json() as { code?: string; message?: string };
    expect(String(body.message ?? '')).not.toContain('10.0.0.9');
    expect(String(body.message ?? '')).not.toContain('password authentication failed');
    await app.close();
  });

  it('GET /auth/devices/me maps a resolve driver failure to a generic 500 without raw text', async () => {
    const app = buildApp(
      {
        register: async () => { throw new Error('unreachable'); },
        rotate: async () => { throw new Error('unreachable'); },
      },
      { resolveToken: async () => { throw rawResolveFailure(); } },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/auth/devices/me',
      headers: { 'x-device-token': 'tok-1' },
    });
    const body = res.json() as { code?: string; message?: string };
    expect(String(body.message ?? '')).not.toContain('10.0.0.9');
    expect(String(body.message ?? '')).not.toContain('ECONNREFUSED');
    expect(res.statusCode).toBe(500);
    expect(body.code).toBe('auth.error');
    await app.close();
  });

  it('POST /auth/devices/revoke maps a resolve driver failure to a generic 500 without raw text', async () => {
    const app = buildApp(
      {
        register: async () => { throw new Error('unreachable'); },
        rotate: async () => { throw new Error('unreachable'); },
      },
      { resolveToken: async () => { throw rawResolveFailure(); } },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/revoke',
      headers: { 'content-type': 'application/json', 'x-device-token': 'tok-1' },
      payload: { token: 'tok-1' },
    });
    const body = res.json() as { code?: string; message?: string };
    expect(String(body.message ?? '')).not.toContain('10.0.0.9');
    expect(String(body.message ?? '')).not.toContain('ECONNREFUSED');
    expect(res.statusCode).toBe(500);
    expect(body.code).toBe('auth.error');
    await app.close();
  });

  it('POST /auth/devices/rotate maps a resolve driver failure to a generic 500 without raw text', async () => {
    const app = buildApp(
      {
        register: async () => { throw new Error('unreachable'); },
        rotate: async () => { throw new Error('unreachable'); },
      },
      { resolveToken: async () => { throw rawResolveFailure(); } },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/rotate',
      headers: { 'content-type': 'application/json', 'x-device-token': 'pred-token' },
      payload: { deviceName: 'phone v2' },
    });
    const body = res.json() as { code?: string; message?: string };
    expect(String(body.message ?? '')).not.toContain('10.0.0.9');
    expect(String(body.message ?? '')).not.toContain('ECONNREFUSED');
    expect(res.statusCode).toBe(500);
    expect(body.code).toBe('auth.error');
    await app.close();
  });

  it('POST /auth/devices/rotate maps a membership driver failure to a generic 500, not 403', async () => {
    const app = buildApp(
      {
        register: async () => { throw new Error('unreachable'); },
        rotate: async () => { throw new Error('unreachable'); },
      },
      {
        resolveToken: async () => ({ deviceId: 'dev-1', householdId: HOUSEHOLD_ID, userId: 'user-1' }),
        workspaceAccess: { resolve: async () => { throw rawResolveFailure(); } },
      },
    );

    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/rotate',
      headers: { 'content-type': 'application/json', 'x-device-token': 'pred-token' },
      payload: { deviceName: 'phone v2' },
    });
    const body = res.json() as { code?: string; message?: string };
    expect(String(body.message ?? '')).not.toContain('10.0.0.9');
    expect(String(body.message ?? '')).not.toContain('ECONNREFUSED');
    expect(res.statusCode).toBe(500);
    expect(body.code).toBe('auth.error');
    await app.close();
  });

  it('POST /auth/devices/revoke maps a revoke-store driver failure to a generic 500 without raw text', async () => {
    const app = buildApp({
      register: async () => { throw new Error('unreachable'); },
      rotate: async () => { throw new Error('unreachable'); },
      revoke: async () => { throw rawPostgresFailure(); },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/revoke',
      headers: { 'content-type': 'application/json', 'x-device-token': 'tok-1' },
      payload: { token: 'tok-1' },
    });
    const body = res.json() as { code?: string; message?: string };
    expect(String(body.message ?? '')).not.toContain('10.0.0.9');
    expect(String(body.message ?? '')).not.toContain('password authentication failed');
    expect(res.statusCode).toBe(500);
    expect(body.code).toBe('auth.error');
    await app.close();
  });

  it('typed auth errors keep their semantics (401 invalid_token, 503 identity_unavailable)', async () => {
    const invalidToken = () =>
      Object.assign(new Error('invalid or revoked device token'), {
        statusCode: 401,
        code: 'auth.invalid_token',
      });
    const meApp = buildApp(
      {
        register: async () => { throw new Error('unreachable'); },
        rotate: async () => { throw new Error('unreachable'); },
      },
      { resolveToken: async () => { throw invalidToken(); } },
    );
    const meRes = await meApp.inject({ method: 'GET', url: '/auth/devices/me', headers: { 'x-device-token': 'bad' } });
    expect(meRes.statusCode).toBe(401);
    expect((meRes.json() as { code?: string }).code).toBe('auth.invalid_token');
    await meApp.close();

    const unavailableApp = buildApp(
      {
        register: async () => { throw new Error('unreachable'); },
        rotate: async () => { throw new Error('unreachable'); },
      },
      { resolveToken: async () => { throw sanitizedUnavailable(); } },
    );
    const revokeRes = await unavailableApp.inject({
      method: 'POST',
      url: '/auth/devices/revoke',
      headers: { 'content-type': 'application/json', 'x-device-token': 'tok-1' },
      payload: { token: 'tok-1' },
    });
    expect(revokeRes.statusCode).toBe(503);
    expect((revokeRes.json() as { code?: string }).code).toBe('auth.identity_unavailable');
    await unavailableApp.close();
  });
});
