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

  // users.phone is NOT NULL UNIQUE in the VPS legacy schema but is unused for
  // email-based app users (real phone binding lives in user_phone_bindings).
  // Use the user's email as a deterministic unique phone fallback (users.email
  // is already UNIQUE via users_email_uidx) to satisfy NOT NULL + UNIQUE without
  // colliding on ''.
  const appUserResult = await queryInTransaction<Row>(pool,
    `INSERT INTO users (auth_user_id, email, name, phone, created_at)
     VALUES ($1, $2, $3, $2, $4)
     ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, phone = EXCLUDED.phone
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
  ...(row['revoked_at'] ? { revokedAt: row['revoked_at'] as Date } : {}),
  ...(row['created_at'] ? { createdAt: row['created_at'] as Date } : {}),
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
    return withTransaction(pool, async (client) => {
      const inviteResult = await client.query<Row>(
        `SELECT id, household_id, email_normalized, role, token_hash, expires_at, consumed_at, revoked_at, invited_by
           FROM invites
          WHERE token_hash = $1
          FOR UPDATE`,
        [tokenHash],
      );
      if (inviteResult.rowCount === 0) throw new InviteError('invite was not found', 'invite.not_found', 404);
      const invite = mapInvite(inviteResult.rows[0]!);
      if (invite.revokedAt) throw new InviteError('invite was revoked', 'invite.revoked', 410);
      if (invite.acceptedAt) throw new InviteError('invite was already used', 'invite.already_used', 409);
      if (invite.expiresAt.getTime() <= now.getTime()) throw new InviteError('invite expired', 'invite.expired', 410);

      const userResult = await client.query<Row>(
        `SELECT id, email, name, "createdAt" FROM "user" WHERE id = $1`,
        [userId],
      );
      const user = userResult.rows[0];
      if (!user) throw new InviteError('invite requires an existing user', 'invite.user_not_found', 404);
      if (normalizeInviteEmail(userEmail) !== invite.email || normalizeInviteEmail(user['email'] as string) !== invite.email) {
        throw new InviteError('authenticated email does not match invite', 'invite.email_mismatch', 403);
      }

      // Same phone fallback as ensureApplicationUser: email is UNIQUE, phone='' would
      // collide on second user (users_phone_key UNIQUE). Use email as phone.
      const appUserResult = await client.query<Row>(
        `INSERT INTO users (auth_user_id, email, name, phone, created_at)
         VALUES ($1, $2, $3, $2, $4)
         ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, phone = EXCLUDED.phone
         RETURNING id`,
        [userId, user['email'], user['name'], user['createdAt']],
      );
      const appUser = appUserResult.rows[0]!;
      const membershipResult = await client.query<Row>(
        `INSERT INTO memberships (user_id, household_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, household_id) DO UPDATE SET role = memberships.role
         RETURNING user_id, household_id, role`,
        [appUser['id'], invite.householdId, invite.role],
      );
      await client.query(
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

  async listPendingInvites(householdId, now = new Date()) {
    const result = await queryInTransaction<Row>(pool,
      `SELECT id, household_id, email_normalized, role, expires_at, created_at
         FROM invites
        WHERE household_id = $1
          AND consumed_at IS NULL
          AND revoked_at IS NULL
          AND expires_at > $2
        ORDER BY created_at ASC`,
      [householdId, now],
    );
    return result.rows.map((row) => ({
      id: row['id'] as string,
      householdId: row['household_id'] as string,
      email: row['email_normalized'] as string,
      role: row['role'] as InviteRecord['role'],
      expiresAt: row['expires_at'] as Date,
      ...(row['created_at'] ? { createdAt: row['created_at'] as Date } : {}),
    }));
  },

  async listPendingInvitesByEmail(emailNormalized, now = new Date()) {
    const result = await queryInTransaction<Row>(pool,
      `SELECT id, household_id, email_normalized, role, expires_at, created_at
         FROM invites
        WHERE email_normalized = $1
          AND consumed_at IS NULL
          AND revoked_at IS NULL
          AND expires_at > $2
        ORDER BY created_at ASC`,
      [emailNormalized, now],
    );
    return result.rows.map((row) => ({
      id: row['id'] as string,
      householdId: row['household_id'] as string,
      email: row['email_normalized'] as string,
      role: row['role'] as InviteRecord['role'],
      expiresAt: row['expires_at'] as Date,
      ...(row['created_at'] ? { createdAt: row['created_at'] as Date } : {}),
    }));
  },

  async revokeInvite({ householdId, inviteId, now = new Date() }) {
    return withTransaction(pool, async (client) => {
      const result = await client.query<Row>(
        `UPDATE invites
            SET revoked_at = $3
          WHERE id = $1
            AND household_id = $2
            AND consumed_at IS NULL
            AND revoked_at IS NULL
          RETURNING id, household_id, revoked_at`,
        [inviteId, householdId, now],
      );
      if (result.rowCount === 0) {
        const check = await client.query<Row>(
          `SELECT id, consumed_at, revoked_at FROM invites WHERE id = $1 AND household_id = $2`,
          [inviteId, householdId],
        );
        if (check.rowCount === 0) throw new InviteError('invite was not found', 'invite.not_found', 404);
        if (check.rows[0]?.['consumed_at']) throw new InviteError('invite was already used', 'invite.already_used', 409);
        return {
          id: inviteId,
          householdId,
          revokedAt: check.rows[0]?.['revoked_at'] as Date,
        };
      }
      return {
        id: result.rows[0]!['id'] as string,
        householdId: result.rows[0]!['household_id'] as string,
        revokedAt: result.rows[0]!['revoked_at'] as Date,
      };
    });
  },

  async getPendingInvite(householdId, inviteId) {
    const result = await queryInTransaction<Row>(pool,
      `SELECT id, household_id, email, email_normalized, role, token_hash, expires_at, consumed_at, revoked_at, invited_by, created_at
         FROM invites
        WHERE id = $1 AND household_id = $2`,
      [inviteId, householdId],
    );
    if (result.rowCount === 0) throw new InviteError('invite was not found', 'invite.not_found', 404);
    const row = result.rows[0]!;
    if (row['consumed_at']) throw new InviteError('invite was already used', 'invite.already_used', 409);
    if (row['revoked_at']) throw new InviteError('invite was revoked', 'invite.revoked', 410);
    return mapInvite(row);
  },

  async activateResentInvite({ householdId, inviteId, expectedTokenHash, newTokenHash, newExpiresAt, now = new Date() }) {
    const result = await queryInTransaction<Row>(pool,
      `UPDATE invites
          SET token_hash = $4,
              expires_at = $5
        WHERE id = $1
          AND household_id = $2
          AND token_hash = $3
          AND consumed_at IS NULL
          AND revoked_at IS NULL
        RETURNING id, household_id, email_normalized, role, token_hash, expires_at, consumed_at, revoked_at, invited_by, created_at`,
      [inviteId, householdId, expectedTokenHash, newTokenHash, newExpiresAt],
    );
    if (result.rowCount === 0) {
      const check = await queryInTransaction<Row>(pool,
        `SELECT id, consumed_at, revoked_at, token_hash FROM invites WHERE id = $1 AND household_id = $2`,
        [inviteId, householdId],
      );
      if (check.rowCount === 0) throw new InviteError('invite was not found', 'invite.not_found', 404);
      if (check.rows[0]?.['consumed_at']) throw new InviteError('invite was already used', 'invite.already_used', 409);
      if (check.rows[0]?.['revoked_at']) throw new InviteError('invite was revoked', 'invite.revoked', 410);
      throw new InviteError('invite was modified concurrently', 'invite.already_used', 409);
    }
    return mapInvite(result.rows[0]!);
  },

  async verifyInvite({ tokenHash, now }) {
    const result = await queryInTransaction<Row>(pool,
      `SELECT id, household_id, email_normalized, role, token_hash, expires_at, consumed_at, revoked_at, invited_by
         FROM invites
        WHERE token_hash = $1`,
      [tokenHash],
    );
    if (result.rowCount === 0) throw new InviteError('invite was not found', 'invite.not_found', 404);
    const invite = mapInvite(result.rows[0]!);
    if (invite.revokedAt) throw new InviteError('invite was revoked', 'invite.revoked', 410);
    if (invite.acceptedAt) throw new InviteError('invite was already used', 'invite.already_used', 409);
    if (invite.expiresAt.getTime() <= now.getTime()) throw new InviteError('invite expired', 'invite.expired', 410);
    return {
      id: invite.id,
      householdId: invite.householdId,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
    };
  },
});
