import type { Pool } from 'pg';
import { queryInTransaction } from '../db/pool.js';
import { normalizeInviteEmail } from './invites.js';

export type InviteSignupGuard = (email: string) => Promise<boolean>;

export const createPostgresInviteSignupGuard = (pool: Pool): InviteSignupGuard => {
  return async (email: string): Promise<boolean> => {
    const normalized = normalizeInviteEmail(email);
    if (!normalized || !normalized.includes('@')) return false;
    const result = await queryInTransaction<{ count: string }>(
      pool,
      `SELECT COUNT(*)::text AS count
         FROM invites
        WHERE email_normalized = $1
          AND consumed_at IS NULL
          AND revoked_at IS NULL
          AND expires_at > NOW()`,
      [normalized],
    );
    const count = Number(result.rows[0]?.count ?? '0');
    return count > 0;
  };
};

export const createInMemoryInviteSignupGuard = (store: {
  hasPendingInviteForEmail?: (email: string, now?: Date) => Promise<boolean> | boolean;
  listPendingInvites?: (householdId: string, now?: Date) => Promise<Array<{ email: string }>>;
  invites?: Array<{ email: string; expiresAt: Date; acceptedAt?: Date; revokedAt?: Date }>;
}): InviteSignupGuard => {
  // For tests / in-memory stores without DB, we can check a provided store or simple array.
  return async (email: string): Promise<boolean> => {
    const normalized = normalizeInviteEmail(email);
    if (store.hasPendingInviteForEmail) {
      return Boolean(await store.hasPendingInviteForEmail(normalized));
    }
    if (store.invites) {
      const now = new Date();
      return store.invites.some((inv) => {
        if (normalizeInviteEmail(inv.email) !== normalized) return false;
        if (inv.acceptedAt) return false;
        if (inv.revokedAt) return false;
        if (inv.expiresAt.getTime() <= now.getTime()) return false;
        return true;
      });
    }
    // No store info: allow (fallback for dev without guard)
    return true;
  };
};
