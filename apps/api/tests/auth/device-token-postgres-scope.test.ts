import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPostgresDeviceTokenStore } from '../../src/auth/device-token.js';

const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';

describe('postgres device token workspace scope (T2.4 hardened contract)', () => {
  it('scopes the hash lookup by household when a scope is provided', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ device_id: 'device-1', household_id: HOUSEHOLD_ID, expires_at: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const store = createPostgresDeviceTokenStore({ query } as never);

    await expect(store.resolve('some-presented-header', HOUSEHOLD_ID)).resolves.toEqual({
      deviceId: 'device-1',
      householdId: HOUSEHOLD_ID,
      userId: null,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('household_id = $2'),
      [createHash('sha256').update('some-presented-header', 'utf8').digest('hex'), HOUSEHOLD_ID],
    );
  });

  it('rejects a token scoped to another household', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const store = createPostgresDeviceTokenStore({ query } as never);

    await expect(store.resolve('some-presented-header', 'other-household')).rejects.toMatchObject({
      code: 'auth.invalid_token',
    });
  });

  it('registers opaque tokens (no household embedded) and persists the hash', async () => {
    const query = vi.fn().mockResolvedValue({});
    const store = createPostgresDeviceTokenStore({ query } as never);

    const created = await store.register('device-1', HOUSEHOLD_ID);

    expect(created.token).not.toContain(HOUSEHOLD_ID);
    expect(created.token).not.toContain('.');
    const expectedHash = createHash('sha256').update(created.token, 'utf8').digest('hex');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO device_tokens'),
      [`v2:${expectedHash}`, created.deviceId, HOUSEHOLD_ID, expectedHash, 'device-1', null],
    );
  });
});
