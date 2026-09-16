import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp } from '../test-app.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';
import { createInMemoryDeviceTokenStore } from '../../src/auth/device-token.js';

const jsonHeaders = { 'content-type': 'application/json' };

const rotate = (app: ReturnType<typeof buildTestApp>['app'], headers: Record<string, string>, payload: unknown = {}) =>
  app.inject({ method: 'POST', url: '/auth/devices/rotate', headers: { ...jsonHeaders, ...headers }, payload });

const me = (app: ReturnType<typeof buildTestApp>['app'], token: string) =>
  app.inject({ method: 'GET', url: '/auth/devices/me', headers: { 'x-device-token': token } });

afterEach(() => {
  delete process.env.DEVICE_ROTATION_WINDOW_HOURS;
});

describe('T2.5 RED — POST /auth/devices/rotate (SPEC §9 C4)', () => {
  it('requires authentication: no session and no device token → 401', async () => {
    const { app } = buildTestApp({}, false);
    const res = await rotate(app, {});
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid current device token → 401', async () => {
    const { app } = buildTestApp({}, false);
    const res = await rotate(app, { 'x-device-token': 'not-a-real-token' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('auth.invalid_token');
  });

  it('rotates with a valid device token: 201 + new token + same household', async () => {
    const store = createInMemoryDeviceTokenStore();
    const { app } = buildTestApp({}, store, false);
    const prev = await store.register('phone', HOUSEHOLD_A);

    const res = await rotate(app, { 'x-device-token': prev.token }, { deviceName: 'phone v2' });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token).not.toBe(prev.token);
    expect(body.householdId).toBe(HOUSEHOLD_A);
    expect(typeof body.deviceId).toBe('string');
  });

  it('inside the rotation window both the old and the new token authenticate', async () => {
    const store = createInMemoryDeviceTokenStore();
    const { app } = buildTestApp({}, store, false);
    const prev = await store.register('phone', HOUSEHOLD_A);

    const res = await rotate(app, { 'x-device-token': prev.token });
    const next = res.json().token as string;

    expect((await me(app, prev.token)).statusCode).toBe(200);
    expect((await me(app, next)).statusCode).toBe(200);
  });

  it('after the window only the new token authenticates (lazy expiry, no job)', async () => {
    // Tiny rotation window (≈110ms) with a real sleep: past the window the
    // predecessor rejects while the successor keeps authenticating.
    process.env.DEVICE_ROTATION_WINDOW_HOURS = '0.00003';
    const store = createInMemoryDeviceTokenStore();
    const { app } = buildTestApp({}, store, false);
    const prev = await store.register('phone', HOUSEHOLD_A);

    const res = await rotate(app, { 'x-device-token': prev.token });
    expect(res.statusCode).toBe(201);
    const next = res.json().token as string;

    // Inside the window both authenticate.
    expect((await me(app, prev.token)).statusCode).toBe(200);
    expect((await me(app, next)).statusCode).toBe(200);

    await new Promise((r) => setTimeout(r, 400));

    const oldMe = await me(app, prev.token);
    expect(oldMe.statusCode).toBe(401);
    expect(oldMe.json().code).toBe('auth.invalid_token');
    expect((await me(app, next)).statusCode).toBe(200);
  });

  it('rotating with an already-expired predecessor → 401 (no resurrection)', async () => {
    process.env.DEVICE_ROTATION_WINDOW_HOURS = '0.00003';
    const store = createInMemoryDeviceTokenStore();
    const { app } = buildTestApp({}, store, false);
    const prev = await store.register('phone', HOUSEHOLD_A);
    await rotate(app, { 'x-device-token': prev.token });

    await new Promise((r) => setTimeout(r, 400));

    const res = await rotate(app, { 'x-device-token': prev.token });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a body householdId that does not match the authenticated context → 403', async () => {
    const store = createInMemoryDeviceTokenStore();
    const { app } = buildTestApp({}, store, false);
    const prev = await store.register('phone', HOUSEHOLD_A);

    const res = await rotate(app, { 'x-device-token': prev.token }, { householdId: 'other-household' });
    expect(res.statusCode).toBe(403);
  });

  it('exposes the new raw token exactly once: /me never echoes a token', async () => {
    const store = createInMemoryDeviceTokenStore();
    const { app } = buildTestApp({}, store, false);
    const prev = await store.register('phone', HOUSEHOLD_A);

    const res = await rotate(app, { 'x-device-token': prev.token });
    const next = res.json().token as string;

    const check = await me(app, next);
    expect(check.statusCode).toBe(200);
    expect(check.json()).not.toHaveProperty('token');
  });

  it('rotates with a valid Better-Auth session and no device header → 201', async () => {
    const { memoryAdapter } = await import('better-auth/adapters/memory');
    const { createBetterAuth } = await import('../../src/auth/better-auth.js');
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });

    const { app } = buildTestApp({}, auth, true);
    const signUp = await auth.api.signUpEmail({
      body: { email: 'rotate@example.com', password: 'securePassword123!', name: 'Rotate User' },
      headers: new Headers({ origin: 'http://localhost:3000' }),
      asResponse: true,
    });
    const cookieHeader = signUp.headers.get('set-cookie') ?? '';

    const res = await rotate(app, { cookie: cookieHeader }, { deviceName: 'session phone' });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.token).toBe('string');
    expect(typeof body.householdId).toBe('string');

    // The session-issued token authenticates on the scoped device flow.
    expect((await me(app, body.token)).statusCode).toBe(200);

    await auth.close();
  });
});
