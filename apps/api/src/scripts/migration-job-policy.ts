import {
  MIGRATION_ADVISORY_LOCK_SQL,
  withMigrationAdvisoryLock,
} from '../db/migration-lock.js';

export { MIGRATION_ADVISORY_LOCK_SQL, withMigrationAdvisoryLock };

export type MigrationJobEnvironment = {
  BACKUP_CONFIRMED?: string;
  BACKUP_ID?: string;
};

/** Explicit human/automation gate required before applying SQL migrations. */
export const isBackupGateSatisfied = (env: MigrationJobEnvironment): boolean =>
  env.BACKUP_CONFIRMED === 'true' && Boolean(env.BACKUP_ID?.trim());
