import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerAuthRoutes } from '../../src/routes/auth.js';
import type { createBetterAuth } from '../../src/auth/better-auth.js';

const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';
const WS = '22222222-2222-4222-8222-222222222222';

const driverFailure = () =>
  Object.assign(new Error('connect ECONNREFUSED 10.0.0.9:5432 - SELECT FROM sessions'), {
    code: 'ECONNREFUSED',
  });

const buildAuthMock = (getSession: (headers: Headers) => Promise<unknown>) =>
  ({
    api: { getSession: async ({ headers }: { headers: Headers }) => getSession(headers) },
    options: { baseURL: 'http://localhost:3001', trustedOrigins: [] },
  }) as unknown as ReturnType<typeof createBetterAuth>;

type Opts = {
  auth?: ReturnType<typeof createBetterAuth>;
  workspaceAccess?: { resolve: (...args: unknown[]) => Promise<unknown> };
  workspaceStore?: { list: (...args: unknown[]) => Promise<unknown[]> };
};

const buildApp = (calls: { register: number; rotate: number }, opts: Opts) => {
  const app = Fastify();
  registerAuthRoutes(app, {
    resolveToken: async () => ({ deviceId: 'dev-1', householdId: HOUSEHOLD_ID, userId: null }),
    tokenStore: {
      resolve: async () => ({ deviceId: 'dev-1', householdId: HOUSEHOLD_ID, userId: null }),
      register: async (deviceName: string, householdId: string, extra?: { userId?: string }) => {
        calls.register += 1;
        return { token: 'tok-new', deviceId: 'dev-new', householdId, ...(extra?.userId ? { userId: extra.userId } : {}) };
      },
      revoke: async () => undefined,
      revokeAllForUserWorkspace: async () => 0,
      rotate: async (_pred: unknown, deviceName: string, householdId: string, extra?: { userId?: string }) => {
        calls.rotate += 1;
        return { token: 'tok-rot', deviceId: 'dev-new', householdId, ...(extra?.userId ? { userId: extra.userId } : {}) };
      },
    },
    defaultHouseholdId: HOUSEHOLD_ID,
    ...(opts.auth ? { auth: opts.auth } : {}),
    ...(opts.workspaceAccess ? { workspaceAccess: opts.workspaceAccess as never } : {}),
    ...(opts.workspaceStore ? { workspaceStore: opts.workspaceStore as never } : {}),
  });
  return app;
};

describe('FIX-API-SESSION-RESOLUTION-FAIL-CLOSED — operational failures are 500, never anonymous', () => {
  it('POST /auth/devices/register: session lookup throw → 500 auth.error, no token minted', async () => {
    const calls = { register: 0, rotate: 0 };
    const app = buildApp(calls, { auth: buildAuthMock(async () => { throw driverFailure(); }) });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: { 'content-type': 'application/json', cookie: 'better-auth.session_token=sess-1' },
      payload: { deviceName: 'phone' },
    });
    expect(res.statusCode).toBe(500);
    const body = res.json() as { code?: string; message?: string };
    expect(body.code).toBe('auth.error');
    expect(String(body.message ?? '')).not.toContain('10.0.0.9');
    expect(String(body.message ?? '')).not.toContain('ECONNREFUSED');
    expect(calls.register).toBe(0);
    await app.close();
  });

  it('POST /auth/devices/register: membership lookup throw → 500 auth.error, no token minted', async () => {
    const calls = { register: 0, rotate: 0 };
    const app = buildApp(calls, {
      auth: buildAuthMock(async () => ({ user: { id: 'user-1', email: 'u@x.test' }, session: { id: 's-1' } })),
      workspaceAccess: { resolve: async () => { throw driverFailure(); } },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: { 'content-type': 'application/json', cookie: 'better-auth.session_token=sess-1', 'x-workspace-id': WS },
      payload: { deviceName: 'phone' },
    });
    expect(res.statusCode).toBe(500);
    expect((res.json() as { code?: string }).code).toBe('auth.error');
    expect(String((res.json() as { message?: string }).message ?? '')).not.toContain('10.0.0.9');
    expect(calls.register).toBe(0);
    await app.close();
  });

  it('POST /auth/devices/register: workspace list throw → 500 auth.error, no token minted', async () => {
    const calls = { register: 0, rotate: 0 };
    const app = buildApp(calls, {
      auth: buildAuthMock(async () => ({ user: { id: 'user-1', email: 'u@x.test' }, session: { id: 's-1' } })),
      workspaceStore: { list: async () => { throw driverFailure(); } },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: { 'content-type': 'application/json', cookie: 'better-auth.session_token=sess-1' },
      payload: { deviceName: 'phone' },
    });
    expect(res.statusCode).toBe(500);
    expect((res.json() as { code?: string }).code).toBe('auth.error');
    expect(calls.register).toBe(0);
    await app.close();
  });

  it('POST /auth/devices/rotate (cookie, no header): session lookup throw → 500 auth.error, no rotation', async () => {
    const calls = { register: 0, rotate: 0 };
    const app = buildApp(calls, { auth: buildAuthMock(async () => { throw driverFailure(); }) });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/rotate',
      headers: { 'content-type': 'application/json', cookie: 'better-auth.session_token=sess-1' },
      payload: { deviceName: 'phone v2' },
    });
    expect(res.statusCode).toBe(500);
    expect((res.json() as { code?: string }).code).toBe('auth.error');
    expect(String((res.json() as { message?: string }).message ?? '')).not.toContain('10.0.0.9');
    expect(calls.rotate).toBe(0);
    await app.close();
  });

  it('null session stays anonymous where allowed (no auth throw → permitted path, no 500)', async () => {
    const calls = { register: 0, rotate: 0 };
    const app = buildApp(calls, { auth: buildAuthMock(async () => null) });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: { 'content-type': 'application/json' },
      payload: { deviceName: 'phone' },
    });
    // Open registration in this harness (disableDeviceRegistration unset):
    // anonymous null-session must still reach the store, not 500.
    expect(res.statusCode).toBe(201);
    expect(calls.register).toBe(1);
    await app.close();
  });

  it('explicit denied membership stays 403 auth.workspace_forbidden (not 500)', async () => {
    const calls = { register: 0, rotate: 0 };
    const app = buildApp(calls, {
      auth: buildAuthMock(async () => ({ user: { id: 'user-1', email: 'u@x.test' }, session: { id: 's-1' } })),
      workspaceAccess: { resolve: async () => undefined },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: { 'content-type': 'application/json', cookie: 'better-auth.session_token=sess-1', 'x-workspace-id': WS },
      payload: { deviceName: 'phone' },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code?: string }).code).toBe('auth.workspace_forbidden');
    expect(calls.register).toBe(0);
    await app.close();
  });
});
