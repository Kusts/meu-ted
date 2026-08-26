import { describe, it, expect, beforeEach } from 'vitest';
import { buildTestApp } from '../test-app.js';
import { TOKEN_A } from '../test-app.js';

describe('auth: device token', () => {
  let app: ReturnType<typeof buildTestApp>['app'];
  beforeEach(() => { app = buildTestApp().app; });

  it('returns 401 when X-Device-Token header is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/transactions' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('auth.missing_token');
  });

  it('returns 401 for unknown / revoked token', async () => {
    const res = await app.inject({ method: 'GET', url: '/transactions', headers: { 'x-device-token': 'not-a-real-token' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('auth.invalid_token');
  });

  it('validates device via /auth/devices/me', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/devices/me', headers: { 'x-device-token': TOKEN_A } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ deviceId: 'dev-device-1' });
    expect(typeof res.json().householdId).toBe('string');
  });
});

describe('POST /auth/devices/register', () => {
  let app: ReturnType<typeof buildTestApp>['app'];
  beforeEach(() => { app = buildTestApp({}, false).app; });

  it('registers a new device and returns token + deviceId + householdId', async () => {
    const res = await app.inject({
      method: 'POST', url: '/auth/devices/register',
      headers: { 'content-type': 'application/json' },
      payload: { deviceName: 'iPhone do Walis' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThanOrEqual(36);
    expect(typeof body.deviceId).toBe('string');
    expect(typeof body.householdId).toBe('string');
  });

  it('registered token works with /auth/devices/me', async () => {
    const reg = await app.inject({ method: 'POST', url: '/auth/devices/register', headers: { 'content-type': 'application/json' }, payload: { deviceName: 'Test' } });
    const { token } = reg.json();
    const me = await app.inject({ method: 'GET', url: '/auth/devices/me', headers: { 'x-device-token': token } });
    expect(me.statusCode).toBe(200);
    expect(me.json().deviceId).toBeDefined();
  });

  it('rejects empty device name', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/devices/register', headers: { 'content-type': 'application/json' }, payload: { deviceName: '   ' } });
    expect(res.statusCode).toBe(400);
  });

  it('does not require auth to register (bootstrapping)', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/devices/register', headers: { 'content-type': 'application/json' }, payload: { deviceName: 'First' } });
    expect(res.statusCode).toBe(201);
  });
});

describe('POST /auth/devices/revoke', () => {
  let app: ReturnType<typeof buildTestApp>['app'];
  beforeEach(() => { app = buildTestApp({}, false).app; });

  it('revokes a registered token and returns 200 ok', async () => {
    const reg = await app.inject({ method: 'POST', url: '/auth/devices/register', headers: { 'content-type': 'application/json' }, payload: { deviceName: 'X' } });
    const { token } = reg.json();
    const rev = await app.inject({ method: 'POST', url: '/auth/devices/revoke', headers: { 'content-type': 'application/json', 'x-device-token': token }, payload: { token } });
    expect(rev.statusCode).toBe(200);
    expect(rev.json().ok).toBe(true);
  });

  it('revoked token returns 401 on /auth/devices/me', async () => {
    const reg = await app.inject({ method: 'POST', url: '/auth/devices/register', headers: { 'content-type': 'application/json' }, payload: { deviceName: 'Y' } });
    const { token } = reg.json();
    await app.inject({ method: 'POST', url: '/auth/devices/revoke', headers: { 'content-type': 'application/json', 'x-device-token': token }, payload: { token } });
    const me = await app.inject({ method: 'GET', url: '/auth/devices/me', headers: { 'x-device-token': token } });
    expect(me.statusCode).toBe(401);
    expect(me.json().code).toBe('auth.invalid_token');
  });

  it('re-register after revoke works (new token)', async () => {
    const first = await app.inject({ method: 'POST', url: '/auth/devices/register', headers: { 'content-type': 'application/json' }, payload: { deviceName: 'A' } });
    const t1 = first.json().token;
    await app.inject({ method: 'POST', url: '/auth/devices/revoke', headers: { 'content-type': 'application/json', 'x-device-token': t1 }, payload: { token: t1 } });
    const second = await app.inject({ method: 'POST', url: '/auth/devices/register', headers: { 'content-type': 'application/json' }, payload: { deviceName: 'B' } });
    expect(second.statusCode).toBe(201);
    expect(second.json().token).not.toBe(t1);
  });

  it('revoke on already-revoked token still returns 200 (idempotent)', async () => {
    const reg = await app.inject({ method: 'POST', url: '/auth/devices/register', headers: { 'content-type': 'application/json' }, payload: { deviceName: 'Z' } });
    const { token } = reg.json();
    await app.inject({ method: 'POST', url: '/auth/devices/revoke', headers: { 'content-type': 'application/json', 'x-device-token': token }, payload: { token } });
    const second = await app.inject({ method: 'POST', url: '/auth/devices/revoke', headers: { 'content-type': 'application/json', 'x-device-token': TOKEN_A }, payload: { token } });
    expect(second.statusCode).toBe(200);
  });

  it('rejects empty token', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/devices/revoke', headers: { 'content-type': 'application/json', 'x-device-token': TOKEN_A }, payload: { token: '' } });
    expect(res.statusCode).toBe(400);
  });
});
