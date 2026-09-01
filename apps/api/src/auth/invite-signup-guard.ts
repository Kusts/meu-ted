import type { Pool } from 'pg';
import { queryInTransaction } from '../db/pool.js';
import { normalizeInviteEmail } from './invites.js';

export type InviteSignupGuard = (email: string) => Promise<boolean>;

export const createPostgresInviteSignupGuard = (pool: Pool): InviteSignupGuard => {
  return async (email: string): Promise<boolean> => {
    const normalized = normalizeInviteEmail(email);
    if (!normalized || !normalized.includes('@')) return false;

    // 1) Account invite from admin (signup-only)
    const accountResult = await queryInTransaction<{ count: string }>(
      pool,
      `SELECT COUNT(*)::text AS count
         FROM account_invites
        WHERE email_normalized = $1
           AND consumed_at IS NULL
           AND revoked_at IS NULL
           AND expires_at > NOW()`,
      [normalized],
    );
    if (Number(accountResult.rows[0]?.count ?? '0') > 0) return true;

    // 2) Workspace invite from OWNER for email WITHOUT account (link único criar conta+aceitar)
    // Check if target email already has an account -> then this path is not for signup
    const hasAccount = await queryInTransaction<{ count: string }>(
      pool,
      `SELECT COUNT(*)::text AS count FROM "user" WHERE lower(email) = $1`,
      [normalized],
    );
    if (Number(hasAccount.rows[0]?.count ?? '0') > 0) return false;

    const wsResult = await queryInTransaction<{ count: string }>(
      pool,
      `SELECT COUNT(*)::text AS count
         FROM invites i
        WHERE i.email_normalized = $1
           AND i.consumed_at IS NULL
           AND i.revoked_at IS NULL
           AND i.expires_at > NOW()
           AND EXISTS (
             SELECT 1 FROM memberships m
             JOIN users u ON u.id = m.user_id
            WHERE m.household_id = i.household_id
              AND m.role = 'owner'
              AND m.status = 'active'
              AND u.id = i.invited_by
           )`,
      [normalized],
    );
    return Number(wsResult.rows[0]?.count ?? '0') > 0;
  };
};

export const createInMemoryInviteSignupGuard = (store: {
  hasPendingInviteForEmail?: (email: string, now?: Date) => Promise<boolean> | boolean;
  listPendingInvites?: (householdId: string, now?: Date) => Promise<Array<{ email: string }>>;
  invites?: Array<{ email: string; expiresAt: Date; acceptedAt?: Date; revokedAt?: Date; invitedByRole?: string }>;
  accountInvites?: Array<{ email: string; expiresAt: Date; consumedAt?: Date; revokedAt?: Date }>;
  hasAccount?: (email: string) => boolean;
}): InviteSignupGuard => {
  return async (email: string): Promise<boolean> => {
    const normalized = normalizeInviteEmail(email);
    if (store.hasPendingInviteForEmail) {
      return Boolean(await store.hasPendingInviteForEmail(normalized));
    }
    const now = new Date();
    // 1) Account invite from admin
    if (store.accountInvites) {
      const hasAccountInvite = store.accountInvites.some((inv) => {
        if (normalizeInviteEmail(inv.email) !== normalized) return false;
        if (inv.consumedAt) return false;
        if (inv.revokedAt) return false;
        if (inv.expiresAt.getTime() <= now.getTime()) return false;
        return true;
      });
      if (hasAccountInvite) return true;
    }
    if (store.invites) {
      // For in-memory tests, if hasAccount is provided, emulate the owner-only for without-account logic
      const targetHasAccount = store.hasAccount ? store.hasAccount(normalized) : false;
      return store.invites.some((inv) => {
        if (normalizeInviteEmail(inv.email) !== normalized) return false;
        if (inv.acceptedAt) return false;
        if (inv.revokedAt) return false;
        if (inv.expiresAt.getTime() <= now.getTime()) return false;
        // If target already has account, this path is not for signup (they would just accept invite)
        if (targetHasAccount) return false;
        // Only owner invites allow signup for without-account
        if (inv.invitedByRole && inv.invitedByRole !== 'owner') return false;
        return true;
      });
    }
    return true;
  };
};
