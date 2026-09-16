import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../test-app.js';
import type { DeviceTokenStore } from '../../src/auth/device-token.js';

const TOKEN = 'context-test-token';

const createCountingTokenStore = (onResolve: () => void): DeviceTokenStore => ({
  async resolve() {
    onResolve();
    return { deviceId: 'context-device', householdId: '00000000-0000-4000-8000-000000000001' };
  },
  async register() {
    return { token: TOKEN, deviceId: 'context-device', householdId: '00000000-0000-4000-8000-000000000001' };
  },
  async revoke() {},
  async rotate(_currentToken, _deviceName, householdId) {
    return { token: TOKEN, deviceId: 'context-device', householdId };
  },
});

describe('auth context pre-handler', () => {
  it('resolves the device token once for a protected route', async () => {
    let resolveCalls = 0;
    const app = buildTestApp({}, createCountingTokenStore(() => { resolveCalls += 1; })).app;

    const response = await app.inject({
      method: 'GET',
      url: '/accounts',
      headers: { 'x-device-token': TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(resolveCalls).toBe(1);
  });

  it('uses the shared context for /auth/devices/me', async () => {
    let resolveCalls = 0;
    const app = buildTestApp({}, createCountingTokenStore(() => { resolveCalls += 1; })).app;

    const response = await app.inject({
      method: 'GET',
      url: '/auth/devices/me',
      headers: { 'x-device-token': TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ deviceId: 'context-device' });
    expect(resolveCalls).toBe(1);
  });

  it('uses the shared authentication for self-revocation', async () => {
    let resolveCalls = 0;
    const app = buildTestApp({}, createCountingTokenStore(() => { resolveCalls += 1; })).app;

    const response = await app.inject({
      method: 'POST',
      url: '/auth/devices/revoke',
      headers: { 'x-device-token': TOKEN,
        'idempotency-key': crypto.randomUUID(), 'content-type': 'application/json' },
      payload: { token: TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(resolveCalls).toBe(1);
  });
});
