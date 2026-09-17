import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../test-app.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';
import { createInMemoryDeviceTokenStore } from '../../src/auth/device-token.js';
import type { WorkspaceAccessStore } from '../../src/auth/workspace-access.js';

const jsonHeaders = { 'content-type': 'application/json' };

/**
 * V4.1 REVIEWFIX F1 [major] — a removed device token must not rotate.
 *
 * The rotate-by-device-token path resolved only scope/expiry/revocation.
 * After the fix it requires authorized resolution (active membership), so a
 * member removed before the revocation hook fires gets 403, not a successor.
 *
 * NOTE: buildTestApp detects optionals by shape — the workspaceAccess stub
 * must precede the token store (both expose `resolve`, first match wins).
 */
const workspaceAccessFor = (members: Set<string>): WorkspaceAccessStore => ({
  async resolve(userId: string, workspaceId: string) {
    if (workspaceId !== HOUSEHOLD_A) return null;
    if (!members.has(userId)) return null;
    return { householdId: HOUSEHOLD_A, userId, role: 'member' as const };
  },
});

const rotate = (app: ReturnType<typeof buildTestApp>['app'], token: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/devices/rotate',
    headers: { ...jsonHeaders, 'x-device-token': token },
    payload: { deviceName: 'rotated' },
  });

describe('V4.1 REVIEWFIX F1 — rotate requires active membership', () => {
  it('removed member rotating by device token → 403 (no successor minted)', async () => {
    const tokenStore = createInMemoryDeviceTokenStore();
    const members = new Set<string>(['member-active']);
    const { app } = buildTestApp(
      {},
      workspaceAccessFor(members),
      tokenStore,
      false,
    );
    const prev = await tokenStore.register('phone', HOUSEHOLD_A, { userId: 'member-removed' });

    const res = await rotate(app, prev.token);

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('auth.workspace_forbidden');
  });

  it('active member rotating by device token → 201 (control)', async () => {
    const tokenStore = createInMemoryDeviceTokenStore();
    const members = new Set<string>(['member-active']);
    const { app } = buildTestApp(
      {},
      workspaceAccessFor(members),
      tokenStore,
      false,
    );
    const prev = await tokenStore.register('phone', HOUSEHOLD_A, { userId: 'member-active' });

    const res = await rotate(app, prev.token);

    expect(res.statusCode).toBe(201);
    expect(typeof res.json().token).toBe('string');
  });
});
