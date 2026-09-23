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

describe('postgres device token user lineage (uuid column vs Better-Auth TEXT id)', () => {
  const AUTH_TEXT_ID = 'WUCGTzoQ7LRRe8eftJjFyKowx96Ryrbs';
  const APP_UUID = 'adbb7007-7b8d-4cf3-8c86-e1057c43f4ff';

  const mockPoolForRegister = () => {
    const query = vi.fn()
      // users lineage lookup (register resolves the session user first)
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: APP_UUID }] })
      // INSERT
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    return { store: createPostgresDeviceTokenStore({ query } as never), query };
  };

  it('register resolves a Better-Auth TEXT session id to the application users.id before insert', async () => {
    const { store, query } = mockPoolForRegister();

    await store.register('iPhone do Walis', HOUSEHOLD_ID, { userId: AUTH_TEXT_ID });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('auth_user_id = $1'),
      [AUTH_TEXT_ID],
    );
    const insertCall = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO device_tokens'))!;
    expect(insertCall[1][5]).toBe(APP_UUID);
  });

  it('register falls back to NULL lineage when the session id cannot be resolved', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const store = createPostgresDeviceTokenStore({ query } as never);

    await store.register('unknown device', HOUSEHOLD_ID, { userId: AUTH_TEXT_ID });

    const insertCall = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO device_tokens'))!;
    expect(insertCall[1][5]).toBeNull();
  });

  it('register keeps NULL lineage when no session user is provided (anonymous bootstrap)', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const store = createPostgresDeviceTokenStore({ query } as never);

    await store.register('bootstrap', HOUSEHOLD_ID);

    expect(query).toHaveBeenCalledTimes(1);
    const insertCall = query.mock.calls[0]!;
    expect(insertCall[1][5]).toBeNull();
  });

  const mockPoolForRotate = (predecessorUserId: string | null, resolvedUsersId: string | null = APP_UUID) => {
    const predecessorRow = {
      device_id: 'device-1',
      household_id: HOUSEHOLD_ID,
      expires_at: null,
      legacy: false,
      user_id: predecessorUserId,
    };
    // The lineage lookup runs INSIDE the rotation transaction (client), so the
    // session identity resolves against the same snapshot the successor uses.
    const clientQuery = vi.fn((text: string) => {
      if (text.includes('FOR UPDATE')) {
        return Promise.resolve({ rowCount: 1, rows: [predecessorRow] });
      }
      if (text.includes('auth_user_id')) {
        return Promise.resolve(
          resolvedUsersId ? { rowCount: 1, rows: [{ id: resolvedUsersId }] } : { rowCount: 0, rows: [] },
        );
      }
      if (text.includes('INSERT INTO')) {
        return Promise.resolve({ rowCount: 1, rows: [] });
      }
      // BEGIN / COMMIT / confinement UPDATE
      return Promise.resolve({ rowCount: 0, rows: [] });
    });
    const client = { query: clientQuery, release: vi.fn() };
    const pool = {
      query: vi.fn(() => Promise.resolve({ rowCount: 0, rows: [] })),
      connect: vi.fn().mockResolvedValue(client),
    };
    return { store: createPostgresDeviceTokenStore(pool as never), pool, clientQuery };
  };

  it('rotate adopts the session user resolved to the application users.id when the predecessor has no owner', async () => {
    const predecessor = `v2:${createHash('sha256').update('pred-token', 'utf8').digest('hex')}`;
    const { store, clientQuery } = mockPoolForRotate(null);

    await store.rotate(predecessor, 'rotated', HOUSEHOLD_ID, { userId: AUTH_TEXT_ID });

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('auth_user_id = $1'),
      [AUTH_TEXT_ID],
    );
    const insertCall = clientQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO device_tokens'))!;
    expect(insertCall[1][5]).toBe(APP_UUID);
  });

  it('rotate verifies the session user in the application identity space before inheriting the predecessor owner', async () => {
    const predecessor = `v2:${createHash('sha256').update('pred-token-2', 'utf8').digest('hex')}`;
    const { store, clientQuery } = mockPoolForRotate(APP_UUID, APP_UUID);

    // Session carries the Better-Auth TEXT id; it resolves to the same
    // application users.id as the predecessor owner, so rotation proceeds.
    await store.rotate(predecessor, 'rotated', HOUSEHOLD_ID, { userId: AUTH_TEXT_ID });

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('auth_user_id = $1'),
      [AUTH_TEXT_ID],
    );
    const insertCall = clientQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO device_tokens'))!;
    expect(insertCall[1][5]).toBe(APP_UUID);
  });

  it('rotate rejects when the resolved session user differs from the predecessor owner', async () => {
    const predecessor = `v2:${createHash('sha256').update('pred-token-3', 'utf8').digest('hex')}`;
    const OTHER_UUID = 'bbbbbbbb-7b8d-4cf3-8c86-e1057c43f4ff';
    const { store, clientQuery } = mockPoolForRotate(APP_UUID, OTHER_UUID);

    await expect(
      store.rotate(predecessor, 'rotated', HOUSEHOLD_ID, { userId: AUTH_TEXT_ID }),
    ).rejects.toMatchObject({ code: 'auth.user_mismatch' });
    // Successor must never be written on mismatch.
    const insertCalls = clientQuery.mock.calls.filter((c) => String(c[0]).includes('INSERT INTO device_tokens'));
    expect(insertCalls).toHaveLength(0);
  });
});
