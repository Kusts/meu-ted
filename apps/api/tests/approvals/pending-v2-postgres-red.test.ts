/**
 * Postgres half of the pending-v2 transition-matrix contract (T0.3-FILES).
 *
 * REPLACES the former 8-line stub. Runs the SAME harness exported from
 * `pending-v2-contract.test.ts` against `createPostgresPendingOperationV2Store`.
 *
 * DB gate (follows `requireTestDatabase` in src/db/db-guard.ts exactly):
 *  only runs when env DATABASE_URL_TEST is set (plus DB_TEST_MARKER when the
 *  guard requires a server-side marker). Otherwise the suite is skipped with
 *  an explicit console report — never silently.
 * Each test uses a unique workspace UUID; rows are deleted in afterEach.
 */

import { describe, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { createPostgresPendingOperationV2Store } from '../../src/approvals/pending-v2.js';
import { definePendingV2ContractSuite } from './pending-v2-contract.test.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const SKIP_MESSAGE =
  '[pending-v2-postgres-red] SKIP: DATABASE_URL_TEST is not set — Postgres half skipped. ' +
  'The in-memory half in pending-v2-contract.test.ts still covers the transition matrix.';

if (!DB_URL) {
  console.log(SKIP_MESSAGE);
  describe.skip('pending-v2 contract (postgres)', () => {});
} else {
  let pool: Pool | undefined;
  const workspaces = new Set<string>();

  beforeAll(async () => {
    pool = createPool({ connectionString: DB_URL, max: 4 });
    await requireTestDatabase(pool, 'pending-v2-postgres-red');
  }, 30_000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  definePendingV2ContractSuite(
    'pending-v2 contract (postgres)',
    () => createPostgresPendingOperationV2Store(pool!),
    {
      trackWorkspace: (workspaceId: string) => {
        workspaces.add(workspaceId);
      },
      cleanup: async () => {
        if (!pool || workspaces.size === 0) return;
        const ids = [...workspaces];
        workspaces.clear();
        await pool.query('DELETE FROM pending_operations WHERE workspace_id = ANY($1)', [ids]);
      },
    },
  );
}
