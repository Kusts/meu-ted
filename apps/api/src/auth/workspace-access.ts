import type { Pool } from 'pg';
import { queryInTransaction } from '../db/pool.js';

export type WorkspaceAccess = {
  userId: string;
  householdId: string;
  role: 'owner' | 'member';
  kind: 'personal' | 'shared';
};

export type WorkspaceAccessStore = {
  resolve(authUserId: string, householdId: string): Promise<WorkspaceAccess | undefined>;
};

export const requireWorkspaceRole = <T extends WorkspaceAccess['role']>(
  request: { workspaceAccess?: WorkspaceAccess },
  allowedRoles: readonly T[],
): WorkspaceAccess & { role: T } => {
  const access = request.workspaceAccess;
  if (!access || !allowedRoles.includes(access.role as T)) {
    throw Object.assign(new Error('workspace role is not authorized'), {
      statusCode: 403,
      code: 'auth.workspace_role_forbidden',
    });
  }
  return access as WorkspaceAccess & { role: T };
};

type Row = Record<string, unknown>;

export const createPostgresWorkspaceAccessStore = (pool: Pool): WorkspaceAccessStore => ({
  async resolve(authUserId, householdId) {
    const result = await queryInTransaction<Row>(pool,
      `SELECT u.id AS user_id, m.household_id, m.role, h.kind
         FROM users u
         JOIN memberships m ON m.user_id = u.id
         JOIN households h ON h.id = m.household_id
        WHERE u.auth_user_id = $1
          AND u.status = 'active'
          AND m.household_id = $2
          AND m.status = 'active'`,
      [authUserId, householdId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      userId: row['user_id'] as string,
      householdId: row['household_id'] as string,
      role: row['role'] as WorkspaceAccess['role'],
      kind: row['kind'] as WorkspaceAccess['kind'],
    };
  },
});
