import { describe, expect, it } from 'vitest';
import { createDelegatedTurnToken } from '../../src/auth/delegated-token.js';
import { createInMemoryDeviceTokenStore } from '../../src/auth/device-token.js';
import { buildTestApp } from '../test-app.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';

const SECRET = 'h12-delegation-secret-32-chars-minimum!';

/** Membership always granted (the device gate is what these tests exercise). */
const workspaceAccess = {
  resolve: async (userId: string, householdId: string) => ({
    userId,
    householdId,
    role: 'member' as const,
    kind: 'personal' as const,
  }),
};

/** Two devices on the SAME household. */
const twoDevices = async () => {
  const store = createInMemoryDeviceTokenStore();
  const a = await store.register('device A', HOUSEHOLD_A);
  const b = await store.register('device B', HOUSEHOLD_A);
  return { store, a, b };
};

const mintDelegated = (deviceId: string | undefined, capabilities: string[]) =>
  createDelegatedTurnToken(
    {
      actorId: 'user-1',
      workspaceId: HOUSEHOLD_A,
      role: 'member',
      capabilities,
      requestId: `turn-${Math.random()}`,
      ...(deviceId !== undefined ? { deviceId } : {}),
    },
    SECRET,
    Date.now(),
  );

describe('H-12: deviceId binding end-to-end no token delegado', () => {
  it('mutação sem device é rejeitada (read-only explícito)', async () => {
    const token = await mintDelegated(undefined, ['financial.read', 'financial.write']);
    const { app } = buildTestApp({}, workspaceAccess, SECRET);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/budgets',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': HOUSEHOLD_A,
        'idempotency-key': `h12-${Date.now()}`,
        'content-type': 'application/json',
      },
      payload: { amount: 10 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('auth.device_binding_required');
  });

  it('leitura sem device continua permitida (compatibilidade read-only)', async () => {
    const token = await mintDelegated(undefined, ['financial.read']);
    const { app } = buildTestApp({}, workspaceAccess, SECRET);
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/accounts',
      headers: { authorization: `Bearer ${token}`, 'x-workspace-id': HOUSEHOLD_A },
    });
    expect(res.statusCode).toBe(200);
  });

  it('token do dispositivo A apresentado no dispositivo B falha', async () => {
    const { store, a, b } = await twoDevices();
    const token = await mintDelegated(a.deviceId, ['financial.read']);
    const { app } = buildTestApp({}, workspaceAccess, store, SECRET);
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/accounts',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': HOUSEHOLD_A,
        'x-device-token': b.token,
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('auth.device_mismatch');
  });

  it('dispositivo revogado é rejeitado no boundary', async () => {
    const { store, b } = await twoDevices();
    await store.revoke(b.token, HOUSEHOLD_A);
    const token = await mintDelegated(b.deviceId, ['financial.read']);
    const { app } = buildTestApp({}, workspaceAccess, store, SECRET);
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/accounts',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': HOUSEHOLD_A,
        'x-device-token': b.token,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('mutação com device vinculado passa pelo gate de device', async () => {
    const { store, a } = await twoDevices();
    const token = await mintDelegated(a.deviceId, ['financial.read', 'financial.write']);
    const { app } = buildTestApp({}, workspaceAccess, store, SECRET);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/budgets',
      headers: {
        authorization: `Bearer ${token}`,
        'x-workspace-id': HOUSEHOLD_A,
        'x-device-token': a.token,
        'idempotency-key': `h12-${Date.now()}`,
        'content-type': 'application/json',
      },
      payload: { amount: 10 },
    });
    expect(res.json().code ?? null).not.toBe('auth.device_binding_required');
    expect(res.json().code ?? null).not.toBe('auth.device_mismatch');
  });
});
