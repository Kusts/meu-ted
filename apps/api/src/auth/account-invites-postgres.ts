import type { Pool } from 'pg';
import { queryInTransaction } from '../db/pool.js';
import { InviteError, normalizeInviteEmail, type AccountInviteRecord } from './account-invites.js';
import type { AccountInviteStore } from './account-invites.js';

type Row = Record<string, unknown>;

const mapAccountInvite = (row: Row): AccountInviteRecord => ({
  id: row['id'] as string,
  email: row['email_normalized'] as string,
  tokenHash: row['token_hash'] as string,
  expiresAt: row['expires_at'] as Date,
  ...(row['consumed_at'] ? { consumedAt: row['consumed_at'] as Date } : {}),
  ...(row['revoked_at'] ? { revokedAt: row['revoked_at'] as Date } : {}),
  ...(row['created_at'] ? { createdAt: row['created_at'] as Date } : {}),
  invitedByUserId: row['invited_by'] as string,
});

export const createPostgresAccountInviteStore = (pool: Pool): AccountInviteStore => ({
  async insertAccountInvite(record) {
    const result = await queryInTransaction<Row>(
      pool,
      `INSERT INTO account_invites
         (id, email, email_normalized, token_hash, expires_at, invited_by)
        SELECT $1, $2, $2, $3, $4, u.id
          FROM users u
         WHERE u.auth_user_id = $5
        RETURNING id`,
      [record.id, record.email, record.tokenHash, record.expiresAt, record.invitedByUserId],
    );
    if (result.rowCount !== 1) throw new InviteError('invite requires an existing user', 'invite.user_not_found', 404);
  },

  async verifyAccountInvite({ tokenHash, now }) {
    const result = await queryInTransaction<Row>(
      pool,
      `SELECT id, email_normalized, token_hash, expires_at, consumed_at, revoked_at, invited_by, created_at
         FROM account_invites
        WHERE token_hash = $1`,
      [tokenHash],
    );
    if (result.rowCount === 0) throw new InviteError('invite was not found', 'invite.not_found', 404);
    const invite = mapAccountInvite(result.rows[0]!);
    if (invite.revokedAt) throw new InviteError('invite was revoked', 'invite.revoked', 410);
    if (invite.consumedAt) throw new InviteError('invite was already used', 'invite.already_used', 409);
    if (invite.expiresAt.getTime() <= now.getTime()) throw new InviteError('invite expired', 'invite.expired', 410);
    return { id: invite.id, email: invite.email, expiresAt: invite.expiresAt };
  },

  async consumeAccountInvite({ email, now }) {
    const normalized = normalizeInviteEmail(email);
    await queryInTransaction(
      pool,
      `UPDATE account_invites
          SET consumed_at = $2
        WHERE email_normalized = $1
          AND consumed_at IS NULL
          AND revoked_at IS NULL
          AND expires_at > $2`,
      [normalized, now],
    );
  },

  async revokeAccountInvite({ inviteId, now = new Date() }) {
    const result = await queryInTransaction<Row>(
      pool,
      `UPDATE account_invites
          SET revoked_at = $2
        WHERE id = $1
          AND consumed_at IS NULL
          AND revoked_at IS NULL
        RETURNING id, revoked_at`,
      [inviteId, now],
    );
    if (result.rowCount === 0) {
      const check = await queryInTransaction<Row>(
        pool,
        `SELECT id, consumed_at, revoked_at FROM account_invites WHERE id = $1`,
        [inviteId],
      );
      if (check.rowCount === 0) throw new InviteError('invite was not found', 'invite.not_found', 404);
      if (check.rows[0]?.['consumed_at']) throw new InviteError('invite was already used', 'invite.already_used', 409);
      return { id: inviteId, revokedAt: check.rows[0]?.['revoked_at'] as Date };
    }
    return { id: result.rows[0]!['id'] as string, revokedAt: result.rows[0]!['revoked_at'] as Date };
  },

  async listPendingAccountInvites(now = new Date()) {
    const result = await queryInTransaction<Row>(
      pool,
      `SELECT id, email_normalized, expires_at, created_at
         FROM account_invites
        WHERE consumed_at IS NULL
          AND revoked_at IS NULL
          AND expires_at > $1
        ORDER BY created_at ASC`,
      [now],
    );
    return result.rows.map((row) => ({
      id: row['id'] as string,
      email: row['email_normalized'] as string,
      expiresAt: row['expires_at'] as Date,
      ...(row['created_at'] ? { createdAt: row['created_at'] as Date } : {}),
    }));
  },

  async hasPendingAccountInvite(email, now = new Date()) {
    const normalized = normalizeInviteEmail(email);
    const result = await queryInTransaction<{ count: string }>(
      pool,
      `SELECT COUNT(*)::text AS count
         FROM account_invites
        WHERE email_normalized = $1
          AND consumed_at IS NULL
          AND revoked_at IS NULL
          AND expires_at > $2`,
      [normalized, now],
    );
    return Number(result.rows[0]?.count ?? '0') > 0;
  },
});
