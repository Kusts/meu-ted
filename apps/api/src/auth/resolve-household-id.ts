import type { PoolClient } from 'pg';

/**
 * Resolve whether a scope id is a real household (used for the legacy
 * audit_logs.household_id FK which references households(id)).
 *
 * The idempotency scope id can be a synthetic UUID for operations that do not
 * have a persistent workspace yet (workspace.create, account-invite.create).
 * In that case there is no households row and we must write NULL (the column
 * is nullable; push notifications already use NULL validly). When the scope is
 * a real household we resolve it to satisfy the FK.
 *
 * This is identity/FK resolution, not financial data access — mirroring the
 * pattern of src/auth/resolve-user-id.ts — so it lives outside the
 * workspace-scoped stores contract (which scans src/writes/postgres.ts).
 */
export const resolveHouseholdId = async (
  client: PoolClient,
  scopeId: string | null | undefined,
): Promise<string | null> => {
  if (!scopeId) return null;
  try {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM households WHERE id = $1 LIMIT 1`,
      [scopeId],
    );
    if (result.rowCount === 1) return result.rows[0]!.id;
  } catch {
    // Any lookup failure falls back to NULL (FK-safe)
  }
  return null;
};