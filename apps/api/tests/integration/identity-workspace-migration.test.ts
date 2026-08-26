import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { createPostgresOwnershipTransferStore } from '../../src/auth/ownership-transfers-postgres.js';
import { createPostgresWorkspaceAccessStore } from '../../src/auth/workspace-access.js';
import { createPostgresReadModelStore } from '../../src/read-models/postgres-store.js';
import { expectedMigrationManifest, runMigrations } from '../../src/read-models/sql/migrate.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const LEGACY_DB_URL = process.env.DATABASE_URL_TEST_LEGACY;
const CURRENT_HOUSEHOLD_ID = '33333333-3333-4333-8333-333333333333';
const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444';
const TRANSACTION_ID = '55555555-5555-4555-8555-555555555555';
let pool: Pool | undefined;
let legacyPool: Pool | undefined;

const requireDatabase = (url: string | undefined, name: string): string => {
  if (!url) throw new Error(`${name} is required for identity migration integration tests`);
  return url;
};

const seedFinancialBaseline = async (target: Pool, preExistingHousehold: boolean): Promise<void> => {
  await target.query(`
    CREATE TABLE _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const manifest = expectedMigrationManifest().find((entry) => entry.version === 1)!;
  const sql = readFileSync(new URL('../../src/read-models/sql/V001__init.sql', import.meta.url), 'utf8');
  await target.query(sql);
  await target.query(
    'INSERT INTO _migrations (version, name, checksum) VALUES ($1, $2, $3)',
    [manifest.version, manifest.name, manifest.checksum],
  );
  await target.query(`
    CREATE TABLE "user" (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      email_verified BOOLEAN NOT NULL DEFAULT FALSE, image TEXT,
      created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
    )
  `);
  await target.query(
    `INSERT INTO "user" (id, name, email, created_at, updated_at)
     VALUES ('g423-owner-auth', 'Migrated owner', 'owner@example.test', NOW(), NOW())`,
  );
  await target.query(`
    CREATE TABLE memberships (
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      household_id UUID NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, household_id)
    )
  `);
  if (preExistingHousehold) {
    await target.query(`
      CREATE TABLE households (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await target.query(
      'INSERT INTO households (id, name) VALUES ($1, $2)',
      [CURRENT_HOUSEHOLD_ID, 'Existing household name'],
    );
  }
  await target.query(
    `INSERT INTO accounts (id, household_id, name, kind, balance_cents, status)
     VALUES ($1, $2, 'Current account', 'bank', 12345, 'active')`,
    [ACCOUNT_ID, CURRENT_HOUSEHOLD_ID],
  );
  await target.query(
    `INSERT INTO transactions
      (id, household_id, kind, description, amount_cents, date, account_id, category_id)
     VALUES ($1, $2, 'expense', 'Retained transaction', 2500, '2026-08-01', $3, NULL)`,
    [TRANSACTION_ID, CURRENT_HOUSEHOLD_ID, ACCOUNT_ID],
  );
  await target.query(
    `INSERT INTO memberships (user_id, household_id, role)
     VALUES ('g423-owner-auth', $1, 'owner')`,
    [CURRENT_HOUSEHOLD_ID],
  );
};

const prepareOwnershipTransferRoles = async (target: Pool): Promise<void> => {
  await target.query(`
    DO $$
    BEGIN
      CREATE ROLE g424_app NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await target.query(`
    DO $$
    BEGIN
      CREATE ROLE g424_direct_writer NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await target.query(`
    GRANT USAGE ON SCHEMA public TO g424_app, g424_direct_writer;
    GRANT SELECT ON users, households, memberships, ownership_transfers TO g424_app;
    GRANT INSERT, UPDATE ON ownership_transfers TO g424_app;
    GRANT UPDATE ON memberships, households TO g424_app;
    GRANT EXECUTE ON FUNCTION set_ownership_transfer_context(UUID) TO g424_app;
    GRANT SELECT ON households, memberships TO g424_direct_writer;
    GRANT SELECT, UPDATE ON ownership_transfers TO g424_direct_writer;
  `);
};

const foreignKeys = async (target: Pool, tableName: string): Promise<string[]> => {
  const result = await target.query<{ definition: string }>(
    `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
      WHERE conrelid = $1::regclass
        AND contype = 'f'
      ORDER BY definition`,
    [tableName],
  );
  return result.rows.map(({ definition }) => definition);
};

const assertSchemaAndPreservation = async (target: Pool, preservesExistingHousehold: boolean): Promise<void> => {
  const columns = await target.query<{ table_name: string; column_name: string; data_type: string }>(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'memberships', 'invites', 'households')
        AND column_name IN ('id', 'user_id', 'household_id', 'invited_by', 'kind', 'owner_user_id')
      ORDER BY table_name, column_name`,
  );
  expect(columns.rows).toEqual(expect.arrayContaining([
    { table_name: 'users', column_name: 'id', data_type: 'uuid' },
    { table_name: 'memberships', column_name: 'user_id', data_type: 'uuid' },
    { table_name: 'memberships', column_name: 'household_id', data_type: 'uuid' },
    { table_name: 'invites', column_name: 'id', data_type: 'uuid' },
    { table_name: 'invites', column_name: 'household_id', data_type: 'uuid' },
    { table_name: 'invites', column_name: 'invited_by', data_type: 'uuid' },
    { table_name: 'households', column_name: 'kind', data_type: 'text' },
    { table_name: 'households', column_name: 'owner_user_id', data_type: 'uuid' },
  ]));

  expect(await foreignKeys(target, 'memberships')).toEqual(expect.arrayContaining([
    expect.stringContaining('REFERENCES users(id)'),
    expect.stringContaining('REFERENCES households(id)'),
  ]));
  expect(await foreignKeys(target, 'invites')).toEqual(expect.arrayContaining([
    expect.stringContaining('REFERENCES users(id)'),
    expect.stringContaining('REFERENCES households(id)'),
  ]));

  expect(await target.query(
    'SELECT id, household_id, name, balance_cents FROM accounts WHERE id = $1',
    [ACCOUNT_ID],
  )).toMatchObject({ rows: [{ id: ACCOUNT_ID, household_id: CURRENT_HOUSEHOLD_ID, name: 'Current account', balance_cents: '12345' }] });
  expect(await target.query(
    'SELECT id, household_id, description, amount_cents FROM transactions WHERE id = $1',
    [TRANSACTION_ID],
  )).toMatchObject({ rows: [{ id: TRANSACTION_ID, household_id: CURRENT_HOUSEHOLD_ID, description: 'Retained transaction', amount_cents: '2500' }] });

  const currentHousehold = await target.query<{ id: string; name: string; kind: string }>(
    'SELECT id, name, kind FROM households WHERE id = $1',
    [CURRENT_HOUSEHOLD_ID],
  );
  if (preservesExistingHousehold) {
    expect(currentHousehold.rows).toEqual([{ id: CURRENT_HOUSEHOLD_ID, name: 'Existing household name', kind: 'shared' }]);
  } else {
    expect(currentHousehold.rows).toEqual([{ id: CURRENT_HOUSEHOLD_ID, name: 'Migrated household', kind: 'shared' }]);
  }
  expect(await target.query(
    `SELECT COUNT(*)::int AS active_owner_count
       FROM memberships
      WHERE household_id = $1 AND role = 'owner' AND status = 'active'`,
    [CURRENT_HOUSEHOLD_ID],
  )).toMatchObject({ rows: [{ active_owner_count: 1 }] });

  const ownerId = randomUUID();
  const householdId = randomUUID();
  await target.query(
    `INSERT INTO users (id, email, name) VALUES ($1, $2, 'G4.2 owner')`,
    [ownerId, `${ownerId}@example.test`],
  );
  await target.query(
    'INSERT INTO households (id, name, kind, owner_user_id) VALUES ($1, $2, $3, $4)',
    [householdId, 'G4.2 test', 'personal', ownerId],
  );
  expect(await target.query(
    'SELECT user_id, household_id, role, kind FROM memberships WHERE household_id = $1',
    [householdId],
  )).toMatchObject({ rows: [{ user_id: ownerId, household_id: householdId, role: 'owner', kind: 'personal' }] });
  await expect(
    target.query('UPDATE memberships SET household_id = $2 WHERE household_id = $1', [householdId, CURRENT_HOUSEHOLD_ID]),
  ).rejects.toThrow();
  await expect(
    target.query('INSERT INTO households (id, name, kind, owner_user_id) VALUES ($1, $2, $3, $4)', [randomUUID(), 'Second personal', 'personal', ownerId]),
  ).rejects.toThrow();
  await expect(
    target.query('INSERT INTO invites (id, household_id, email, email_normalized, role, token_hash, expires_at) VALUES ($1, $2, $3, $3, $4, $5, NOW() + INTERVAL \'1 day\')', [randomUUID(), householdId, 'member@example.test', 'member', randomUUID()]),
  ).rejects.toThrow();
  await expect(
    target.query('UPDATE households SET kind = $2 WHERE id = $1', [householdId, 'shared']),
  ).rejects.toThrow();
  await target.query('DELETE FROM households WHERE id = $1', [householdId]);
  await target.query('DELETE FROM users WHERE id = $1', [ownerId]);

  await prepareOwnershipTransferRoles(target);
  const sharedId = randomUUID();
  const sharedOwnerId = randomUUID();
  const transferTargetId = randomUUID();
  const sharedOwnerAuthId = `shared-owner-${sharedOwnerId}`;
  const transferTargetAuthId = `transfer-target-${transferTargetId}`;
  await target.query(
    `INSERT INTO "user" (id, name, email, "createdAt", "updatedAt") VALUES
      ($1, 'Shared owner', $2, NOW(), NOW()),
      ($3, 'Transfer target', $4, NOW(), NOW())`,
    [sharedOwnerAuthId, `${sharedOwnerId}@example.test`, transferTargetAuthId, `${transferTargetId}@example.test`],
  );
  await target.query(
    `INSERT INTO users (id, auth_user_id, email, name) VALUES
      ($1, $2, $3, 'Shared owner'), ($4, $5, $6, 'Transfer target')`,
    [sharedOwnerId, sharedOwnerAuthId, `${sharedOwnerId}@example.test`, transferTargetId, transferTargetAuthId, `${transferTargetId}@example.test`],
  );
  await expect(
    target.query(`INSERT INTO households (id, name, kind) VALUES ($1, 'Ownerless shared', 'shared')`, [randomUUID()]),
  ).rejects.toThrow();
  await target.query(
    `INSERT INTO households (id, name, kind, owner_user_id)
     VALUES ($1, 'Shared workspace', 'shared', $2)`,
    [sharedId, sharedOwnerId],
  );
  await target.query(
    `INSERT INTO memberships (user_id, household_id, role) VALUES ($1, $2, 'member')`,
    [transferTargetId, sharedId],
  );
  await expect(
    target.query(
      `INSERT INTO ownership_transfers
        (id, household_id, from_user_id, to_user_id, status, accepted_by, accepted_at)
       VALUES ($1, $2, $3, $4, 'accepted', $4, NOW())`,
      [randomUUID(), sharedId, sharedOwnerId, transferTargetId],
    ),
  ).rejects.toThrow();
  const transfers = createPostgresOwnershipTransferStore(target, 'g424_app');
  const transfer = await transfers.create({
    householdId: sharedId,
    fromAuthUserId: sharedOwnerAuthId,
    toAuthUserId: transferTargetAuthId,
  });
  const transferId = transfer['id'] as string;
  const workspaceAccess = createPostgresWorkspaceAccessStore(target);
  expect(await workspaceAccess.resolve(transferTargetAuthId, sharedId)).toMatchObject({
    userId: transferTargetId,
    householdId: sharedId,
    role: 'member',
    kind: 'shared',
  });
  const historicalAccountId = randomUUID();
  await target.query(
    `INSERT INTO accounts (id, household_id, name, kind, balance_cents, status)
     VALUES ($1, $2, 'Historical account', 'bank', 1000, 'active')`,
    [historicalAccountId, sharedId],
  );
  await target.query(
    `INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id)
     VALUES ($1, 'expense', 'Before member joined', 100, '2026-08-01', $2)`,
    [sharedId, historicalAccountId],
  );
  expect((await target.query<{ description: string }>(
    `SELECT description FROM transactions WHERE household_id = $1 AND deleted_at IS NULL`,
    [sharedId],
  )).rows).toEqual([{ description: 'Before member joined' }]);
  expect((await createPostgresReadModelStore({ pool: target }).listTransactions(sharedId, { limit: 10, offset: 0 })).items.map((transaction) => transaction.description)).toEqual(['Before member joined']);
  await target.query(
    `UPDATE memberships SET status = 'removed' WHERE household_id = $1 AND user_id = $2`,
    [sharedId, transferTargetId],
  );
  expect(await workspaceAccess.resolve(transferTargetAuthId, sharedId)).toBeUndefined();
  await target.query(
    `UPDATE memberships SET status = 'active' WHERE household_id = $1 AND user_id = $2`,
    [sharedId, transferTargetId],
  );
  expect((await target.query<{ role: string }>(
    `SELECT role FROM memberships WHERE household_id = $1`,
    [sharedId],
  )).rows.map(({ role }) => role).sort()).toEqual(['member', 'owner']);
  await expect(
    target.query('DELETE FROM memberships WHERE household_id = $1 AND user_id = $2', [sharedId, sharedOwnerId]),
  ).rejects.toThrow();
  await expect(
    target.query(`UPDATE ownership_transfers SET status = 'accepted' WHERE id = $1`, [transferId]),
  ).rejects.toThrow();
  await expect(
    target.query(
      `UPDATE ownership_transfers
          SET status = 'accepted', accepted_by = $2, accepted_at = NOW()
        WHERE id = $1`,
      [transferId, transferTargetId],
    ),
  ).rejects.toThrow();
  expect(await target.query(`
    SELECT
      has_table_privilege('g424_direct_writer', 'ownership_transfers', 'UPDATE') AS writer_can_update,
      has_function_privilege('g424_direct_writer', 'set_ownership_transfer_context(uuid)', 'EXECUTE') AS writer_can_set_context,
      has_function_privilege('g424_app', 'set_ownership_transfer_context(uuid)', 'EXECUTE') AS app_can_set_context
  `)).toMatchObject({ rows: [{ writer_can_update: true, writer_can_set_context: false, app_can_set_context: true }] });
  const directWriter = await target.connect();
  try {
    await directWriter.query('BEGIN');
    await directWriter.query('SET LOCAL ROLE g424_direct_writer');
    await directWriter.query(`SELECT set_config('app.authenticated_user_id', $1, true)`, [transferTargetId]);
    await expect(
      directWriter.query(
        `UPDATE ownership_transfers SET status = 'accepted', accepted_by = $2 WHERE id = $1`,
        [transferId, transferTargetId],
      ),
    ).rejects.toThrow();
    await directWriter.query('ROLLBACK');
  } finally {
    directWriter.release();
  }
  await expect(
    transfers.accept({ householdId: sharedId, transferId, destinationAuthUserId: sharedOwnerAuthId }),
  ).rejects.toThrow();
  await transfers.accept({ householdId: sharedId, transferId, destinationAuthUserId: transferTargetAuthId });
  expect(await target.query(
    `SELECT user_id, role, kind, status FROM memberships WHERE household_id = $1`,
    [sharedId],
  )).toEqual(expect.objectContaining({
    rows: expect.arrayContaining([
      { user_id: sharedOwnerId, role: 'member', kind: 'shared', status: 'active' },
      { user_id: transferTargetId, role: 'owner', kind: 'shared', status: 'active' },
    ]),
  }));
  await target.query('DELETE FROM memberships WHERE household_id = $1 AND user_id = $2', [sharedId, sharedOwnerId]);
  await target.query('DELETE FROM households WHERE id = $1', [sharedId]);
  await target.query('DELETE FROM users WHERE id IN ($1, $2)', [sharedOwnerId, transferTargetId]);
};

describe('Postgres identity/workspace migration', () => {
  beforeAll(async () => {
    pool = createPool({ connectionString: requireDatabase(DB_URL, 'DATABASE_URL_TEST'), max: 4 });
    legacyPool = createPool({ connectionString: requireDatabase(LEGACY_DB_URL, 'DATABASE_URL_TEST_LEGACY'), max: 4 });
    await seedFinancialBaseline(pool, true);
    await seedFinancialBaseline(legacyPool, false);
    await runMigrations(pool);

    // The legacy deployment already contains the canonical financial tables
    // from the Agent Pi baseline; seed those pre-identity migrations here.
    for (const version of [2, 4, 5, 6, 7]) {
      const manifest = expectedMigrationManifest().find((entry) => entry.version === version)!;
      const sql = readFileSync(new URL(`../../src/read-models/sql/${manifest.name}`, import.meta.url), 'utf8');
      await legacyPool.query(sql);
      await legacyPool.query(
        'INSERT INTO _migrations (version, name, checksum) VALUES ($1, $2, $3)',
        [manifest.version, manifest.name, manifest.checksum],
      );
    }
    await runMigrations(legacyPool, true);
  });

  afterAll(async () => {
    await Promise.all([pool?.end(), legacyPool?.end()]);
  });

  it('derives the current household from the financial baseline on canonical and legacy paths', async () => {
    await assertSchemaAndPreservation(pool!, true);
    await assertSchemaAndPreservation(legacyPool!, false);
  });
});
