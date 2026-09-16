/**
 * XLT-10 — device-token leak invariant (SPEC §9, T2.4).
 *
 * Crosses ≥ 2 real layers: Postgres (V053-applied schema + SQL) × the
 * production Postgres device-token store × real SHA-256 at rest.
 * Gated by DATABASE_URL_TEST + DB_TEST_MARKER; skips cleanly otherwise.
 *
 * Invariants:
 *  (a) a fresh DB row never contains the raw secret (hash only);
 *  (b) possession of the stored hash alone does not authenticate;
 *  (c) an expired legacy row rejects;
 *  (d) a non-expired legacy row still authenticates (C6/R4 coexistence,
 *      no global logout).
 */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { runMigrations } from '../../src/read-models/sql/migrate.js';
import { createPostgresDeviceTokenStore, hashDeviceToken } from '../../src/auth/device-token.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const describeIfDb = ENABLED ? describe : describe.skip;

if (!ENABLED) {
  console.log(
    '[xlt-10-device-token-leak] SKIP: DATABASE_URL_TEST + DB_TEST_MARKER are required — ' +
      'this suite asserts at-rest secrecy against real PostgreSQL, so every test below is skipped. ' +
      'Set both env vars to run the real leak tests.',
  );
}

const sha256hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
const DEVICE_PREFIX = 'xlt10-';

describeIfDb('XLT-10 — device token leak invariant (real Postgres)', () => {
  let pool: Pool;
  const householdId = randomUUID();
  const createdDeviceIds: string[] = [];

  beforeAll(async () => {
    pool = createPool({ connectionString: DB_URL!, max: 4 });
    await requireTestDatabase(pool, 'xlt-10-device-token-leak');
    await runMigrations(pool);
  }, 60_000);

  afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM device_tokens WHERE device_id LIKE '${DEVICE_PREFIX}%'`).catch(() => undefined);
      await pool.end();
    }
  });

  it('(a) a fresh row stores the hash, never the raw secret', async () => {
    const store = createPostgresDeviceTokenStore(pool);
    const created = await store.register(`${DEVICE_PREFIX}fresh`, householdId, { userId: randomUUID() });
    createdDeviceIds.push(created.deviceId);

    const res = await pool.query<Record<string, unknown>>(
      `SELECT token, device_id, household_id, token_hash, name, user_id, legacy, expires_at FROM device_tokens WHERE device_id = $1`,
      [created.deviceId],
    );
    expect(res.rowCount).toBe(1);
    const row = res.rows[0]!;
    expect(row['token_hash']).toBe(sha256hex(created.token));
    expect(hashDeviceToken(created.token)).toBe(row['token_hash']);
    // The raw secret appears nowhere in the persisted row.
    for (const value of Object.values(row)) {
      if (typeof value === 'string') expect(value).not.toContain(created.token);
    }
    expect(row['token']).not.toBe(created.token);
    expect(row['legacy']).toBe(false);
  });

  it('(b) presenting the stored hash as the header does not authenticate', async () => {
    const store = createPostgresDeviceTokenStore(pool);
    const created = await store.register(`${DEVICE_PREFIX}hash-only`, householdId);
    createdDeviceIds.push(created.deviceId);

    const stolen = sha256hex(created.token);
    await expect(store.resolve(stolen)).rejects.toMatchObject({ code: 'auth.invalid_token' });
  });

  it('(c) an expired legacy row rejects even with the correct raw value', async () => {
    const legacyRaw = `${DEVICE_PREFIX}legacy-expired.${randomUUID()}`;
    const deviceId = `${DEVICE_PREFIX}legacy-expired`;
    await pool.query(
      `INSERT INTO device_tokens (token, device_id, household_id, token_hash, name, legacy, expires_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW() - INTERVAL '1 day')`,
      [legacyRaw, deviceId, householdId, sha256hex(legacyRaw), `${DEVICE_PREFIX}legacy-expired`],
    );

    const store = createPostgresDeviceTokenStore(pool);
    await expect(store.resolve(legacyRaw)).rejects.toMatchObject({ code: 'auth.invalid_token' });
  });

  it('(d) a non-expired legacy row still authenticates (coexistence, no global logout)', async () => {
    const legacyRaw = `${DEVICE_PREFIX}legacy-valid.${randomUUID()}`;
    const deviceId = `${DEVICE_PREFIX}legacy-valid`;
    await pool.query(
      `INSERT INTO device_tokens (token, device_id, household_id, token_hash, name, legacy, expires_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW() + INTERVAL '30 days')`,
      [legacyRaw, deviceId, householdId, sha256hex(legacyRaw), `${DEVICE_PREFIX}legacy-valid`],
    );

    const store = createPostgresDeviceTokenStore(pool);
    await expect(store.resolve(legacyRaw)).resolves.toMatchObject({ householdId });

    const touched = await pool.query<{ last_used_at: string | null }>(
      `SELECT last_used_at FROM device_tokens WHERE device_id = $1`,
      [deviceId],
    );
    expect(touched.rows[0]?.last_used_at).not.toBeNull();
  });

  it('new-token roundtrip: register → resolve → revoke → reject', async () => {
    const store = createPostgresDeviceTokenStore(pool);
    const created = await store.register(`${DEVICE_PREFIX}roundtrip`, householdId);
    createdDeviceIds.push(created.deviceId);

    await expect(store.resolve(created.token)).resolves.toMatchObject({
      deviceId: created.deviceId,
      householdId,
    });
    await store.revoke(created.token, householdId);
    await expect(store.resolve(created.token)).rejects.toMatchObject({ code: 'auth.invalid_token' });
  });
});
