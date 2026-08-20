import { describe, it, expect, beforeEach } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

/**
 * Phase 0.1 — Auth containment tests.
 *
 * 0.1.1 — Vulnerability was: anonymous caller receives default household token.
 *         PROVED via prior test run (was 201, now 403).
 * 0.1.2 — Device registration disabled until Phase 4 (returns 403).
 * 0.1.3 — Self-revocation only (requires x-device-token matching revoked token).
 */

describe('0.1.1 — Vulnerability CLOSED: anonymous registration no longer works', () => {
  let app: ReturnType<typeof buildTestApp>['app'];
  beforeEach(() => { app = buildTestApp().app; });

  it('anonymous registration now returns 403 (vulnerability fixed)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: { 'content-type': 'application/json' },
      payload: { deviceName: 'Attacker Device' },
    });
    // Vulnerability was: 201 with token + householdId.
    // After 0.1.2 fix: 403 registration_disabled.
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('auth.registration_disabled');
  });
});

describe('0.1.2 — device registration blocked (RED → GREEN)', () => {
  let app: ReturnType<typeof buildTestApp>['app'];
  beforeEach(() => { app = buildTestApp().app; });

  it('POST /auth/devices/register returns 403 — registration disabled until Phase 4', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: { 'content-type': 'application/json' },
      payload: { deviceName: 'New Device' },
    });
    // RED: currently returns 201; will change to 403
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('auth.registration_disabled');
  });

  it('no bootstrap HTTP temporary endpoint exists for device provisioning', async () => {
    // Any alternative registration path must also be blocked
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/bootstrap',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    // Should not exist (404) or be blocked (403)
    expect([404, 403]).toContain(res.statusCode);
  });
});

describe('0.1.3 — self-revocation only', () => {
  let app: ReturnType<typeof buildTestApp>['app'];
  beforeEach(() => { app = buildTestApp().app; });

  it('revoke own token returns 200 when authenticated with same token', async () => {
    // Skip if registration already blocked — use pre-existing token
    const token = TOKEN_A;

    const rev = await app.inject({
      method: 'POST',
      url: '/auth/devices/revoke',
      headers: {
        'content-type': 'application/json',
        'x-device-token': token,
        'idempotency-key': crypto.randomUUID(),
      },
      payload: { token },
    });
    expect(rev.statusCode).toBe(200);
    expect(rev.json().ok).toBe(true);
  });

  it('revoke another token without auth returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/revoke',
      headers: { 'content-type': 'application/json' },
      payload: { token: TOKEN_A },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('0.1.4 — Session-subordinated device token issuance & data protection', () => {
  it('data endpoints (/accounts, /dashboard/summary) return 401 without auth', async () => {
    const { app } = buildTestApp();
    const resAccounts = await app.inject({ method: 'GET', url: '/accounts' });
    expect(resAccounts.statusCode).toBe(401);

    const resDashboard = await app.inject({ method: 'GET', url: '/dashboard/summary' });
    expect(resDashboard.statusCode).toBe(401);
  });

  it('allows device registration when caller has a valid Better-Auth session', async () => {
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

    // 1. Sign up / authenticate user via better-auth
    const signUp = await auth.api.signUpEmail({
      body: { email: 'user@example.com', password: 'securePassword123!', name: 'Valid User' },
      headers: new Headers({ origin: 'http://localhost:3000' }),
      asResponse: true,
    });
    const cookieHeader = signUp.headers.get('set-cookie') ?? '';

    // 2. Register device with session cookie
    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
      },
      payload: { deviceName: 'Authorized iPhone' },
    });

    expect(regRes.statusCode).toBe(201);
    const body = regRes.json();
    expect(body.token).toBeDefined();
    expect(body.deviceId).toBeDefined();
    expect(body.householdId).toBeDefined();

    // 3. The obtained device-token can read data
    const dataRes = await app.inject({
      method: 'GET',
      url: '/accounts',
      headers: { 'x-device-token': body.token },
    });
    expect(dataRes.statusCode).toBe(200);

    await auth.close();
  });

  it('rejects device registration when session is invalid or expired', async () => {
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

    const regRes = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: {
        'content-type': 'application/json',
        cookie: 'better-auth.session_token=invalid_or_expired_token',
      },
      payload: { deviceName: 'Unauthorized Device' },
    });

    expect(regRes.statusCode).toBe(403);
    expect(regRes.json().code).toBe('auth.registration_disabled');

    await auth.close();
  });
});

