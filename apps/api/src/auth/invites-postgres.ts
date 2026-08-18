import type { Pool } from 'pg';
import { queryInTransaction, withTransaction } from '../db/pool.js';
import { InviteError, normalizeInviteEmail, type InviteRecord, type InviteStore } from './invites.js';

type Row = Record<string, unknown>;

const ensureApplicationUser = async (pool: Pool, authUserId: string): Promise<string | undefined> => {
  const userResult = await queryInTransaction<Row>(pool,
    `SELECT id, email, name, "createdAt" FROM "user" WHERE id = $1`,
    [authUserId],
  );
  const user = userResult.rows[0];
  if (!user) return undefined;

  const appUserResult = await queryInTransaction<Row>(pool,
    `INSERT INTO users (auth_user_id, email, name, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
     RETURNING id`,
    [authUserId, user['email'], user['name'], user['createdAt']],
  );
  return appUserResult.rows[0]?.['id'] as string | undefined;
};

const mapInvite = (row: Row): InviteRecord => ({
  id: row['id'] as string,
  householdId: row['household_id'] as string,
  email: row['email_normalized'] as string,
  role: row['role'] as InviteRecord['role'],
  tokenHash: row['token_hash'] as string,
  expiresAt: row['expires_at'] as Date,
  ...(row['consumed_at'] ? { acceptedAt: row['consumed_at'] as Date } : {}),
  invitedByUserId: row['invited_by'] as string,
});

export const createPostgresInviteAuthorizer = (pool: Pool) => async (input: { userId: string; householdId: string }): Promise<boolean> => {
  const appUserId = await ensureApplicationUser(pool, input.userId);
  if (!appUserId) return false;
  const result = await queryInTransaction(pool,
    `SELECT 1
       FROM memberships m
       JOIN users u ON u.id = m.user_id
      WHERE u.auth_user_id = $1
        AND m.household_id = $2
        AND m.role = 'owner'
        AND m.status = 'active'
      LIMIT 1`,
    [input.userId, input.householdId],
  );
  return result.rowCount === 1;
};

export const createPostgresInviteStore = (pool: Pool): InviteStore => ({
  async insertInvite(record) {
    const result = await queryInTransaction<Row>(pool,
      `INSERT INTO invites
        (id, household_id, email, email_normalized, role, token_hash, expires_at, invited_by)
       SELECT $1, $2, $3, $3, $4, $5, $6, u.id
         FROM users u
        WHERE u.auth_user_id = $7
       RETURNING id`,
      [record.id, record.householdId, record.email, record.role, record.tokenHash, record.expiresAt, record.invitedByUserId],
    );
    if (result.rowCount !== 1) throw new InviteError('invite requires an existing user', 'invite.user_not_found', 404);
  },

  async acceptInvite({ tokenHash, userId, userEmail, now }) {
    return withTransaction(pool, async () => {
      const inviteResult = await queryInTransaction<Row>(pool,
        `SELECT id, household_id, email_normalized, role, token_hash, expires_at, consumed_at, invited_by
           FROM invites
          WHERE token_hash = $1
          FOR UPDATE`,
        [tokenHash],
      );
      if (inviteResult.rowCount === 0) throw new InviteError('invite was not found', 'invite.not_found', 404);
      const invite = mapInvite(inviteResult.rows[0]!);
      if (invite.acceptedAt) throw new InviteError('invite was already used', 'invite.already_used', 409);
      if (invite.expiresAt.getTime() <= now.getTime()) throw new InviteError('invite expired', 'invite.expired', 410);

      const userResult = await queryInTransaction<Row>(pool,
        `SELECT id, email, name, "createdAt" FROM "user" WHERE id = $1`,
        [userId],
      );
      const user = userResult.rows[0];
      if (!user) throw new InviteError('invite requires an existing user', 'invite.user_not_found', 404);
      if (normalizeInviteEmail(userEmail) !== invite.email || normalizeInviteEmail(user['email'] as string) !== invite.email) {
        throw new InviteError('authenticated email does not match invite', 'invite.email_mismatch', 403);
      }

      const appUserResult = await queryInTransaction<Row>(pool,
        `INSERT INTO users (auth_user_id, email, name, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
         RETURNING id`,
        [userId, user['email'], user['name'], user['createdAt']],
      );
      const appUser = appUserResult.rows[0]!;
      const membershipResult = await queryInTransaction<Row>(pool,
        `INSERT INTO memberships (user_id, household_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, household_id) DO UPDATE SET role = memberships.role
         RETURNING user_id, household_id, role`,
        [appUser['id'], invite.householdId, invite.role],
      );
      await queryInTransaction(pool,
        `UPDATE invites SET consumed_at = $2 WHERE id = $1`,
        [invite.id, now],
      );
      const membership = membershipResult.rows[0]!;
      return {
        invite: { ...invite, acceptedAt: new Date(now) },
        membership: {
          userId: membership['user_id'] as string,
          householdId: membership['household_id'] as string,
          role: membership['role'] as InviteRecord['role'],
        },
      };
    });
  },
});
