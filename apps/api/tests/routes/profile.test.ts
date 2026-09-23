import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerProfileRoutes } from '../../src/routes/profile.js';
import { createInMemoryProfileStore } from '../../src/profile/in-memory.js';
import { AuthError } from '../../src/auth/device-token.js';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';

describe('GET /profile', () => {
  it('returns null profile for unknown household on first read', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ profile: null });
  });

  it('requires auth', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/profile' });
    expect(res.statusCode).toBe(401);
  });

  it('scopes profile by household (one per household)', async () => {
    const { app } = buildTestApp();
    // PATCH on TOKEN_A household A
    await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'Marina' },
    });
    // GET on TOKEN_B household B must not see it
    const bRes = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_B },
    });
    expect(bRes.json()).toEqual({ profile: null });
  });
});

describe('PATCH /profile', () => {
  it('creates a profile on first PATCH and reflects the values in GET', async () => {
    const { app } = buildTestApp();
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: {
        name: 'Marina Silva',
        email: 'marina@email.com',
        phone: '(11) 99999-9999',
        avatarColor: '#0E8C5A',
        greetingStyle: 'auto',
      },
    });
    expect(patchRes.statusCode).toBe(200);
    const profile = patchRes.json().profile;
    expect(profile.name).toBe('Marina Silva');
    expect(profile.email).toBe('marina@email.com');
    expect(profile.phone).toBe('(11) 99999-9999');
    expect(profile.avatarColor).toBe('#0E8C5A');
    expect(profile.greetingStyle).toBe('auto');

    const getRes = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(getRes.json().profile).toEqual({ ...profile, isAdmin: false });
  });

  it('upserts partial fields without clobbering existing ones', async () => {
    const { app } = buildTestApp();
    // First PATCH: name only
    await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: 'Marina' },
    });
    // Second PATCH: contact + avatar only
    const patch2 = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: {
        email: 'marina@nova.com',
        phone: '(11) 98888-7777',
        avatarColor: '#820AD1',
      },
    });
    const profile = patch2.json().profile;
    expect(profile.name).toBe('Marina');
    expect(profile.email).toBe('marina@nova.com');
    expect(profile.phone).toBe('(11) 98888-7777');
    expect(profile.avatarColor).toBe('#820AD1');
  });

  it('rejects invalid email', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid avatarColor (not #RRGGBB)', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { avatarColor: 'red' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects invalid greetingStyle enum', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { greetingStyle: 'shout' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty name', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': TOKEN_A, 'content-type': 'application/json' },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires auth', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /profile isAdmin consistency with GET', () => {
  const buildAdminAwareApp = (sessionEmail: string | undefined, adminEmails?: string[]) => {
    const app = Fastify();
    registerProfileRoutes(app, {
      resolveToken: async () => ({ deviceId: 'dev-1', householdId: 'household-admin' }),
      profileStore: createInMemoryProfileStore(),
      ...(adminEmails ? { adminEmails } : {}),
      ...(sessionEmail === undefined
        ? {}
        : { resolveSessionEmail: async () => sessionEmail }),
    });
    return app;
  };

  const patchName = (app: Fastify.FastifyInstance) =>
    app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': 'dev-token', 'content-type': 'application/json' },
      payload: { name: 'Admin' },
    });

  it('returns isAdmin true on PATCH for an admin session email', async () => {
    const app = buildAdminAwareApp('admin@example.com', ['admin@example.com']);
    const res = await patchName(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().profile.isAdmin).toBe(true);
  });

  it('returns isAdmin false on PATCH for a non-admin session email', async () => {
    const app = buildAdminAwareApp('user@example.com', ['admin@example.com']);
    const res = await patchName(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().profile.isAdmin).toBe(false);
  });

  it('returns explicit isAdmin false on PATCH when no session resolver is configured', async () => {
    const app = buildAdminAwareApp(undefined, ['admin@example.com']);
    const res = await patchName(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().profile.isAdmin).toBe(false);
  });

  it('PATCH and GET agree on isAdmin for the same admin session', async () => {
    const app = buildAdminAwareApp('admin@example.com', ['admin@example.com']);
    const patchRes = await patchName(app);
    const getRes = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { 'x-device-token': 'dev-token' },
    });
    expect(patchRes.json().profile.isAdmin).toBe(true);
    expect(getRes.json().profile.isAdmin).toBe(true);
  });
});

describe('GET /profile auto-provisioning', () => {
  const buildAutoProvisionApp = (sessionEmail: string | undefined, adminEmails?: string[]) => {
    const app = Fastify();
    registerProfileRoutes(app, {
      resolveToken: async () => ({ deviceId: 'dev-1', householdId: 'household-new' }),
      profileStore: createInMemoryProfileStore(),
      ...(adminEmails ? { adminEmails } : {}),
      ...(sessionEmail === undefined
        ? {}
        : { resolveSessionEmail: async () => sessionEmail }),
    });
    return app;
  };

  const getProfile = (app: Fastify.FastifyInstance) =>
    app.inject({
      method: 'GET',
      url: '/profile',
      headers: { 'x-device-token': 'dev-token' },
    });

  it('auto-provisions a minimal profile on GET when a session email resolves and none exists', async () => {
    const app = buildAutoProvisionApp('admin@example.com', ['admin@example.com']);
    const res = await getProfile(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().profile).toMatchObject({
      householdId: 'household-new',
      email: 'admin@example.com',
      isAdmin: true,
    });
  });

  it('auto-provisioned profile carries isAdmin false for a non-admin session email', async () => {
    const app = buildAutoProvisionApp('user@example.com', ['admin@example.com']);
    const res = await getProfile(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().profile).toMatchObject({
      email: 'user@example.com',
      isAdmin: false,
    });
  });

  it('keeps null when no session email resolves and no profile exists', async () => {
    const app = buildAutoProvisionApp(undefined, ['admin@example.com']);
    const res = await getProfile(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ profile: null });
  });

  it('does not clobber an existing profile on GET with a session', async () => {
    const app = buildAutoProvisionApp('admin@example.com', ['admin@example.com']);
    await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': 'dev-token', 'content-type': 'application/json' },
      payload: { name: 'Marina' },
    });
    const res = await getProfile(app);
    expect(res.json().profile).toMatchObject({ name: 'Marina', isAdmin: true });
  });

  it('degrades gracefully to null when auto-provision upsert rejects', async () => {
    const app = Fastify();
    registerProfileRoutes(app, {
      resolveToken: async () => ({ deviceId: 'dev-1', householdId: 'household-new' }),
      profileStore: {
        get: async () => null,
        upsert: async () => {
          throw new Error('db unavailable');
        },
      },
      adminEmails: ['admin@example.com'],
      resolveSessionEmail: async () => 'admin@example.com',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { 'x-device-token': 'dev-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ profile: null });
  });
});

describe('Error handling in /profile', () => {
  it('returns 500 when resolveToken throws an infrastructure error without statusCode (e.g. pg error 53300) on GET', async () => {
    const app = Fastify();
    registerProfileRoutes(app, {
      resolveToken: async () => {
        const err = new Error('sorry, too many clients already');
        (err as unknown as { code: string }).code = '53300';
        throw err;
      },
      profileStore: createInMemoryProfileStore(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { 'x-device-token': 'any-token' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      code: '53300',
      message: 'sorry, too many clients already',
    });
  });

  it('returns 500 when resolveToken throws an infrastructure error without statusCode on PATCH', async () => {
    const app = Fastify();
    registerProfileRoutes(app, {
      resolveToken: async () => {
        const err = new Error('sorry, too many clients already');
        (err as unknown as { code: string }).code = '53300';
        throw err;
      },
      profileStore: createInMemoryProfileStore(),
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': 'any-token', 'content-type': 'application/json' },
      payload: { name: 'Marina' },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      code: '53300',
      message: 'sorry, too many clients already',
    });
  });

  it('preserves 401 when resolveToken throws AuthError with statusCode 401 on GET', async () => {
    const app = Fastify();
    registerProfileRoutes(app, {
      resolveToken: async () => {
        throw new AuthError('invalid or revoked device token', 401, 'auth.invalid_token');
      },
      profileStore: createInMemoryProfileStore(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/profile',
      headers: { 'x-device-token': 'invalid-token' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      code: 'auth.invalid_token',
      message: 'invalid or revoked device token',
    });
  });

  it('preserves 401 when resolveToken throws AuthError with statusCode 401 on PATCH', async () => {
    const app = Fastify();
    registerProfileRoutes(app, {
      resolveToken: async () => {
        throw new AuthError('invalid or revoked device token', 401, 'auth.invalid_token');
      },
      profileStore: createInMemoryProfileStore(),
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'x-device-token': 'invalid-token', 'content-type': 'application/json' },
      payload: { name: 'Marina' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      code: 'auth.invalid_token',
      message: 'invalid or revoked device token',
    });
  });
});

describe('GET/PATCH /profile with unified authenticatedContext (session-first)', () => {
  const buildUnifiedApp = () => {
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      (request as unknown as { authenticatedContext: { householdId: string } }).authenticatedContext = {
        householdId: 'household-session',
      };
    });
    registerProfileRoutes(app, {
      // Legacy fallback must NOT be reachable in this path.
      resolveToken: async () => {
        throw new AuthError('missing device token', 401, 'auth.missing_token');
      },
      profileStore: createInMemoryProfileStore(),
    });
    return app;
  };

  it('PATCH resolves the household from the unified context without a device token', async () => {
    const app = buildUnifiedApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Sessão' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().profile).toMatchObject({ householdId: 'household-session', name: 'Sessão' });
  });

  it('GET resolves the household from the unified context without a device token', async () => {
    const app = buildUnifiedApp();
    await app.inject({
      method: 'PATCH',
      url: '/profile',
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Sessão' },
    });
    const res = await app.inject({ method: 'GET', url: '/profile' });
    expect(res.statusCode).toBe(200);
    expect(res.json().profile).toMatchObject({ householdId: 'household-session', name: 'Sessão' });
  });
});
