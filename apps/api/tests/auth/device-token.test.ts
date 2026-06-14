import { describe, it, expect } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

describe('auth: device token', () => {
  it('returns 401 when X-Device-Token header is missing', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/transactions' });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code).toBe('auth.missing_token');
  });

  it('returns 401 for unknown / revoked token', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/transactions',
      headers: { 'x-device-token': 'not-a-real-token' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('auth.invalid_token');
  });

  it('validates device via /auth/devices/me', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/auth/devices/me',
      headers: { 'x-device-token': TOKEN_A },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ deviceId: 'dev-device-1' });
    expect(typeof body.householdId).toBe('string');
  });
});
