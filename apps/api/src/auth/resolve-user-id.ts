import type { Pool, PoolClient } from 'pg';

/**
 * Resolve the application users.id for a given actorId.
 * The actorId may be:
 * - a Better-Auth user id (users.auth_user_id, TEXT)
 * - a direct users.id (UUID, compared as text to avoid 22P02)
 * Returns null when no user can be resolved (legacy audit_logs.user_id is nullable
 * and push 12/08 records use NULL validly). This is identity resolution, not
 * financial data access, and mirrors the pattern already used in
 * src/auth/workspaces-postgres.ts:166 and related auth modules.
 * Accepts a Pool or PoolClient so both transactional and standalone callers
 * (e.g. device-token register) share the same identity resolution.
 */
export const resolveApplicationUserId = async (
  client: Pool | PoolClient,
  actorId: string | null | undefined,
): Promise<string | null> => {
  if (!actorId) return null;
  try {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE auth_user_id = $1 OR id::text = $1 LIMIT 1`,
      [actorId],
    );
    if (result.rowCount === 1 && typeof result.rows[0]!.id === 'string' && result.rows[0]!.id !== '') {
      return result.rows[0]!.id;
    }
  } catch {
    // Any lookup failure falls back to NULL (FK-safe)
  }
  return null;
};

/**
 * Fail-closed device-boundary identity resolution (Onda 1 item 1): when a
 * session user id is present, the users row MUST resolve — a missing row or
 * a rejected SELECT throws a sanitized typed error
 * (`auth.identity_unavailable`, 503) instead of falling back to NULL.
 * The message is fixed so driver/SQL text never leaks to callers.
 * The nullable `resolveApplicationUserId` above is intentionally untouched:
 * audit lineage in writes/postgres.ts keeps its nullable policy.
 */
export const IDENTITY_UNAVAILABLE_CODE = 'auth.identity_unavailable';

export const IDENTITY_UNAVAILABLE_MESSAGE = 'user identity unavailable, try again later';

export const identityUnavailableError = (): Error & { statusCode: number; code: string } =>
  Object.assign(new Error(IDENTITY_UNAVAILABLE_MESSAGE), {
    statusCode: 503,
    code: IDENTITY_UNAVAILABLE_CODE,
  });

export const resolveRequiredApplicationUserId = async (
  client: Pool | PoolClient,
  actorId: string,
): Promise<string> => {
  try {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE auth_user_id = $1 OR id::text = $1 LIMIT 1`,
      [actorId],
    );
    if (result.rowCount === 1 && typeof result.rows[0]!.id === 'string' && result.rows[0]!.id !== '') {
      return result.rows[0]!.id;
    }
  } catch {
    throw identityUnavailableError();
  }
  throw identityUnavailableError();
};
