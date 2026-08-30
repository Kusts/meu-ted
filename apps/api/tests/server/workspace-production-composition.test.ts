import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { registerPostgresProductionRoutes } from '../../src/server/production-routes.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createBetterAuth } from '../../src/auth/better-auth.js';

const mockPool = {
  async query(sql: string) {
    if (sql.includes('information_schema.columns')) return { rows: [] };
    if (sql.includes('FROM _migrations')) return { rows: [] };
    if (sql.includes('FROM device_tokens')) return { rows: [{ device_id: 'test-device', household_id: HOUSEHOLD_A }] };
    return { rows: [] };
  },
} as unknown as Pool;

const makeAuth = () => createBetterAuth({
  database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
  disableSignUp: false,
  transaction: false,
  secret: 'test-secret-that-is-at-least-32-characters',
  baseURL: 'http://localhost:3001',
  trustedOrigins: ['http://localhost:3000'],
});

describe('workspace production composition', () => {
  it('mounts workspace and ownership transfer routes in canonical and legacy production compositions', async () => {
    const auth = makeAuth();
    const canonicalApp = Fastify({ logger: false });
    const legacyApp = Fastify({ logger: false });

    registerPostgresProductionRoutes(canonicalApp, mockPool, false, HOUSEHOLD_A, auth);
    registerPostgresProductionRoutes(legacyApp, mockPool, true, HOUSEHOLD_A, auth);

    // Canonical app
    const canonicalWorkspaces = await canonicalApp.inject({ method: 'GET', url: '/workspaces' });
    expect(canonicalWorkspaces.statusCode).toBe(401);
    expect(canonicalWorkspaces.json()).toMatchObject({ code: 'auth.missing_session' });

    const canonicalTransfers = await canonicalApp.inject({
      method: 'POST',
      url: `/workspaces/${HOUSEHOLD_A}/ownership-transfers`,
      payload: { toUserId: '00000000-0000-4000-8000-000000000002' },
    });
    expect(canonicalTransfers.statusCode).toBe(401);

    // Legacy app
    const legacyWorkspaces = await legacyApp.inject({ method: 'GET', url: '/workspaces' });
    expect(legacyWorkspaces.statusCode).toBe(401);
    expect(legacyWorkspaces.json()).toMatchObject({ code: 'auth.missing_session' });

    const legacyTransfers = await legacyApp.inject({
      method: 'POST',
      url: `/workspaces/${HOUSEHOLD_A}/ownership-transfers`,
      payload: { toUserId: '00000000-0000-4000-8000-000000000002' },
    });
    expect(legacyTransfers.statusCode).toBe(401);

    await canonicalApp.close();
    await legacyApp.close();
    await auth.close();
  });

  it('does NOT mount invite routes with a silent no-op when inviteDelivery is omitted', async () => {
    const auth = makeAuth();
    const app = Fastify({ logger: false });
    // inviteDelivery omitted
    registerPostgresProductionRoutes(app, mockPool, false, HOUSEHOLD_A, auth, undefined);

    const inviteRes = await app.inject({
      method: 'POST',
      url: '/auth/invites',
      payload: { householdId: HOUSEHOLD_A, email: 'guest@example.com', role: 'member', expiresAt: new Date().toISOString() },
    });
    // Must return 404 because no inviteService is registered without explicit delivery
    expect(inviteRes.statusCode).toBe(404);

    await app.close();
    await auth.close();
  });

  it('mounts invite routes only when explicit inviteDelivery is provided', async () => {
    const auth = makeAuth();
    const explicitDelivery = async () => undefined;
    const app = Fastify({ logger: false });
    registerPostgresProductionRoutes(app, mockPool, false, HOUSEHOLD_A, auth, explicitDelivery);

    const inviteRes = await app.inject({
      method: 'POST',
      url: '/auth/invites',
      payload: {},
    });
    // With explicit delivery, the route is mounted and responds 401 when unauthenticated (NOT 404)
    expect(inviteRes.statusCode).toBe(401);

    await app.close();
    await auth.close();
  });

  it('rejects invite creation by an authenticated non-owner', async () => {
    const auth = makeAuth();
    await auth.api.createUser({
      body: {
        email: 'member@example.com',
        password: 'MemberPassword123!',
        name: 'Workspace Member',
      },
    });
    const signIn = await auth.api.signInEmail({
      body: {
        email: 'member@example.com',
        password: 'MemberPassword123!',
      },
      asResponse: true,
    });
    const cookie = signIn.headers.get('set-cookie') ?? '';
    const app = Fastify({ logger: false });
    registerPostgresProductionRoutes(app, mockPool, false, HOUSEHOLD_A, auth, async () => undefined);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/invites',
      headers: { cookie },
      payload: {
        householdId: HOUSEHOLD_A,
        email: 'guest@example.com',
        role: 'member',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'auth.invite_forbidden' });
    await app.close();
    await auth.close();
  });
});
