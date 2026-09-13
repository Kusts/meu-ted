export type MigrationJobEnvironment = {
  BACKUP_CONFIRMED?: string;
  BACKUP_ID?: string;
};

export const MIGRATION_ADVISORY_LOCK_SQL = "hashtextextended('pi-finance:migrations', 0)";

type LockPool = { connect: () => Promise<{ query: (sql: string) => Promise<{ rows: Array<{ locked?: boolean; unlocked?: boolean }> }>; release: () => void }> };

export const withMigrationAdvisoryLock = async <T>(pool: LockPool, fn: () => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  let locked = false;
  try {
    const result = await client.query(`SELECT pg_try_advisory_lock(${MIGRATION_ADVISORY_LOCK_SQL}) AS locked`);
    locked = result.rows[0]?.locked === true;
    if (!locked) throw new Error('migration already in progress; refusing concurrent run');
    return await fn();
  } finally {
    if (locked) await client.query(`SELECT pg_advisory_unlock(${MIGRATION_ADVISORY_LOCK_SQL}) AS unlocked`);
    client.release();
  }
};

/** Explicit human/automation gate required before applying SQL migrations. */
export const isBackupGateSatisfied = (env: MigrationJobEnvironment): boolean =>
  env.BACKUP_CONFIRMED === 'true' && Boolean(env.BACKUP_ID?.trim());
