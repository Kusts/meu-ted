/**
 * Shared migration advisory-lock primitive (V4.1 Phase 8, task 8.6).
 *
 * Single global lock (`pg_try_advisory_lock` on a stable 64-bit key) held
 * for the whole migration run so two instances can never apply migrations
 * concurrently. `withMigrationAdvisoryLock` acquires on a dedicated client,
 * runs `fn`, then releases — failing closed when another holder owns it.
 */

export const MIGRATION_ADVISORY_LOCK_SQL = "hashtextextended('pi-finance:migrations', 0)";

export type MigrationLockClient = {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<{ locked?: boolean; unlocked?: boolean }> }>;
  release: () => void;
};

export type MigrationLockPool = {
  connect: () => Promise<MigrationLockClient>;
};

export const withMigrationAdvisoryLock = async <T>(
  pool: MigrationLockPool,
  fn: () => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  let locked = false;
  try {
    const result = await client.query(
      `SELECT pg_try_advisory_lock(${MIGRATION_ADVISORY_LOCK_SQL}) AS locked`,
    );
    locked = result.rows[0]?.locked === true;
    if (!locked) throw new Error('migration already in progress; refusing concurrent run');
    return await fn();
  } finally {
    if (locked)
      await client.query(`SELECT pg_advisory_unlock(${MIGRATION_ADVISORY_LOCK_SQL}) AS unlocked`);
    client.release();
  }
};
