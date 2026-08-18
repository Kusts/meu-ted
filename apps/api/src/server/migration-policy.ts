/** Web processes never apply schema migrations. Use migrate-job.ts explicitly. */
export const WEB_MIGRATION_MODE = 'verify-only' as const;

export const shouldApplyMigrationsInWeb = (): false => false;
