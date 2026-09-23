import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createPostgresDeviceTokenStore,
  generateDeviceToken,
  hashDeviceToken,
} from '../../src/auth/device-token.js';

const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';

const sha256hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

describe('T2.4 RED — device token hardening (SPEC §9 C1/C2/C3/C6)', () => {
  it('generates two distinct random tokens with no household embedded (C1)', () => {
    const a = generateDeviceToken();
    const b = generateDeviceToken();
    expect(a).not.toBe(b);
    expect(a).not.toContain(HOUSEHOLD_ID);
    expect(b).not.toContain(HOUSEHOLD_ID);
    // base64url, no structured prefix
    expect(a).not.toContain('.');
  });

  it('register stores only the SHA-256 hash, never the raw secret (C2)', async () => {
    const query = vi.fn((text: string) => {
      // Lineage resolution runs before the INSERT (uuid column vs TEXT id).
      if (text.includes('auth_user_id')) {
        return Promise.resolve({ rowCount: 1, rows: [{ id: 'user-1' }] });
      }
      return Promise.resolve({ rowCount: 1, rows: [] });
    });
    const store = createPostgresDeviceTokenStore({ query } as never);

    const created = await store.register('laptop', HOUSEHOLD_ID, { userId: 'user-1' });

    expect(query).toHaveBeenCalledTimes(2);
    const insertCall = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO device_tokens')) as [string, unknown[]];
    const [sql, args] = insertCall;
    expect(sql).toMatch(/token_hash/);
    // The raw secret must not be persisted in any argument.
    expect(args).not.toContain(created.token);
    expect(args).toContain(sha256hex(created.token));
    // Lineage persists the application users.id (resolved), not the raw session id.
    expect(args).toContain('user-1');
    expect(hashDeviceToken(created.token)).toBe(sha256hex(created.token));
  });

  it('resolve looks up by hash of the presented header (C2)', async () => {
    const raw = generateDeviceToken();
    const query = vi.fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ device_id: 'dev-1', household_id: HOUSEHOLD_ID, expires_at: null }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const store = createPostgresDeviceTokenStore({ query } as never);

    await expect(store.resolve(raw)).resolves.toMatchObject({ householdId: HOUSEHOLD_ID });

    const [sql, args] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/token_hash/);
    expect(sql).toMatch(/household_id\s*=\s*\$2/);
    expect(args).toEqual([sha256hex(raw), null]);
    expect(args).not.toContain(raw);
  });

  it('rejects an expired legacy token even with the correct raw value (C6 window)', async () => {
    const legacyRaw = `${HOUSEHOLD_ID}.legacy-secret`;
    const query = vi.fn()
      // hash path: no match
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      // legacy path: expired row
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          device_id: 'dev-legacy',
          household_id: HOUSEHOLD_ID,
          token: legacyRaw,
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }],
      });
    const store = createPostgresDeviceTokenStore({ query } as never);

    await expect(store.resolve(legacyRaw)).rejects.toMatchObject({ code: 'auth.invalid_token' });
  });

  it('possession of the stored hash alone does not authenticate (leak invariant)', async () => {
    const raw = generateDeviceToken();
    const stolenHash = sha256hex(raw);
    // Whatever the DB holds, presenting the hash as the header must miss:
    // the store hashes the header again, so sha256(hash) never matches.
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const store = createPostgresDeviceTokenStore({ query } as never);

    await expect(store.resolve(stolenHash)).rejects.toMatchObject({ code: 'auth.invalid_token' });
    const [, args] = query.mock.calls[0] as [string, unknown[]];
    expect(args).toContain(sha256hex(stolenHash));
  });
});
