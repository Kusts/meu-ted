import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/pool.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
const schema = `v043_probe_${process.pid}`;

let adminPool: Pool | undefined;
let pool: Pool | undefined;

const scopedUrl = (value: string): string => {
  const url = new URL(value);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  return url.toString();
};

const v017 = readFileSync(new URL('../../src/read-models/sql/V017__better_auth.sql', import.meta.url), 'utf8');
const v019 = readFileSync(new URL('../../src/read-models/sql/V019__better_auth_casing.sql', import.meta.url), 'utf8');
const v043 = readFileSync(
  new URL('../../src/read-models/sql/V043__better_auth_admin_impersonation.sql', import.meta.url),
  'utf8',
);

const columnsOf = async (table: string): Promise<Map<string, string>> => {
  const res = await pool!.query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  return new Map(res.rows.map((r) => [r.column_name, r.data_type]));
};

describe('V043 admin/impersonation migration integration', () => {
  beforeAll(async () => {
    if (!DB_URL) return;
    adminPool = createPool({ connectionString: DB_URL, max: 2 });
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    pool = createPool({ connectionString: scopedUrl(DB_URL), max: 2 });
    // VPS-like starting state: Better Auth native tables exist (V017+V019
    // shape, camelCase), admin/impersonation columns missing (V031 never ran).
    await pool.query(v017);
    await pool.query(v019);
  });

  afterAll(async () => {
    await pool?.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await adminPool.end();
    }
  });

  itIfDatabase('applies cleanly on the VPS-like state and is idempotent', async () => {
    await pool!.query(v043);
    await pool!.query(v043);

    const user = await columnsOf('user');
    expect(user.get('role')).toBe('text');
    expect(user.get('banned')).toBe('boolean');
    // Exact quoted camelCase names: what the Kysely adapter queries.
    expect(user.get('banReason')).toBe('text');
    expect(user.get('banExpires')).toBe('timestamp with time zone');

    const session = await columnsOf('session');
    expect(session.get('impersonatedBy')).toBe('text');

    const account = await columnsOf('account');
    expect(account.get('issuer')).toBe('text');
  });

  itIfDatabase('repairs V031 lowercase leftovers instead of duplicating columns', async () => {
    // Simulate a DB where V031 ran with unquoted identifiers (folded lowercase).
    await pool!.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "banReason"`);
    await pool!.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS banreason TEXT`);
    await pool!.query(v043);

    const user = await columnsOf('user');
    expect(user.get('banReason')).toBe('text');
    expect(user.get('banreason')).toBeUndefined();
  });

  itIfDatabase('answers the exact adapter-shaped queries without "column does not exist"', async () => {
    await pool!.query(v043);
    await pool!.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('u1', 'Admin', 'admin@example.com', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
    );
    const userRes = await pool!.query(
      `SELECT id, role, banned, "banReason", "banExpires" FROM "user" WHERE id = 'u1'`,
    );
    expect(userRes.rows).toHaveLength(1);
    const sessionRes = await pool!.query(`SELECT id, "impersonatedBy" FROM session LIMIT 1`);
    expect(sessionRes.rows).toHaveLength(0);
  });
});
