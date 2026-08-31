import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { createPostgresInviteStore } from '../../src/auth/invites-postgres.js';
import { hashInviteToken, type InviteRecord } from '../../src/auth/invites.js';

const record: InviteRecord = {
  id: 'invite-1',
  householdId: '11111111-1111-4111-8111-111111111111',
  email: 'member@example.com',
  role: 'member',
  tokenHash: hashInviteToken('token-1'),
  expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  invitedByUserId: 'owner-1',
};

describe('Postgres invite store', () => {
  it('persists normalized email and locks the invite during acceptance', async () => {
    const queries: string[] = [];
    const client = {
      query: async (text: string) => {
        queries.push(text);
        if (text.includes('FROM invites')) return { rows: [{
          id: record.id,
          household_id: record.householdId,
          email_normalized: record.email,
          role: record.role,
          token_hash: record.tokenHash,
          expires_at: record.expiresAt,
          consumed_at: null,
          invited_by: 'app-user-1',
        }], rowCount: 1 };
        if (text.includes('FROM "user"')) return { rows: [{ id: 'user-1', email: 'member@example.com', name: 'Member', createdAt: new Date('2029-01-01T00:00:00.000Z') }], rowCount: 1 };
        if (text.includes('INSERT INTO users')) return { rows: [{ id: 'app-user-1' }], rowCount: 1 };
        if (text.includes('INSERT INTO memberships')) return { rows: [{ user_id: 'app-user-1', household_id: record.householdId, role: 'member' }], rowCount: 1 };
        if (text.includes('INSERT INTO invites')) return { rows: [{ id: record.id }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    };
    const pool = {
      query: async (text: string) => {
        queries.push(text);
        if (text.includes('INSERT INTO invites')) return { rows: [{ id: record.id }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
      connect: async () => client,
    } as unknown as Pool;
    const store = createPostgresInviteStore(pool);

    await store.insertInvite(record);
    const accepted = await store.acceptInvite({
      tokenHash: record.tokenHash,
      userId: 'user-1',
      userEmail: ' MEMBER@EXAMPLE.COM ',
      now: new Date('2029-01-01T00:00:00.000Z'),
    });

    expect(accepted.membership.userId).toBe('app-user-1');
    expect(queries.some((query) => query.includes('email_normalized'))).toBe(true);
    expect(queries.some((query) => query.includes('FOR UPDATE'))).toBe(true);
  });

  it('lists pending invites and revokes an invite in postgres store', async () => {
    const queries: string[] = [];
    const client = {
      query: async (text: string) => {
        queries.push(text);
        if (text.includes('UPDATE invites') && text.includes('revoked_at')) {
          return { rows: [{ id: record.id, household_id: record.householdId, revoked_at: new Date('2029-01-01T00:00:00.000Z') }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    };
    const pool = {
      query: async (text: string) => {
        queries.push(text);
        if (text.includes('SELECT id, household_id, email_normalized')) {
          return {
            rows: [{
              id: record.id,
              household_id: record.householdId,
              email_normalized: record.email,
              role: record.role,
              expires_at: record.expiresAt,
              created_at: new Date('2028-01-01T00:00:00.000Z'),
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
      connect: async () => client,
    } as unknown as Pool;
    const store = createPostgresInviteStore(pool);

    const pending = await store.listPendingInvites!(record.householdId, new Date('2029-01-01T00:00:00.000Z'));
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe(record.id);
    expect(pending[0]!.email).toBe(record.email);

    const revoked = await store.revokeInvite!({
      householdId: record.householdId,
      inviteId: record.id,
      now: new Date('2029-01-01T00:00:00.000Z'),
    });
    expect(revoked.id).toBe(record.id);
    expect(revoked.householdId).toBe(record.householdId);
    expect(revoked.revokedAt).toEqual(new Date('2029-01-01T00:00:00.000Z'));
    expect(queries.some((q) => q.includes('revoked_at IS NULL'))).toBe(true);
    expect(queries.some((q) => q.includes('UPDATE invites') && q.includes('SET revoked_at'))).toBe(true);
  });

  it('preserves existing revoked_at monotonically when revoking an already-revoked invite in postgres store', async () => {
    const originalRevokedAt = new Date('2029-01-01T00:00:00.000Z');
    const client = {
      query: async (text: string) => {
        if (text.includes('UPDATE invites')) {
          // Already revoked: rowCount 0 because revoked_at IS NULL is false
          return { rows: [], rowCount: 0 };
        }
        if (text.includes('SELECT id, consumed_at, revoked_at FROM invites')) {
          return {
            rows: [{
              id: record.id,
              consumed_at: null,
              revoked_at: originalRevokedAt,
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    };
    const pool = {
      connect: async () => client,
    } as unknown as Pool;
    const store = createPostgresInviteStore(pool);

    const reRevoked = await store.revokeInvite!({
      householdId: record.householdId,
      inviteId: record.id,
      now: new Date('2029-08-01T00:00:00.000Z'),
    });

    expect(reRevoked.id).toBe(record.id);
    expect(reRevoked.householdId).toBe(record.householdId);
    expect(reRevoked.revokedAt).toEqual(originalRevokedAt);
  });

  it('fetches pending invite and activates resent invite with CAS in postgres store', async () => {
    const queries: string[] = [];
    const newTokenHash = 'new-token-hash-123456';
    const pool = {
      query: async (text: string) => {
        queries.push(text);
        if (text.includes('SELECT') && text.includes('FROM invites')) {
          return {
            rows: [{
              id: record.id,
              household_id: record.householdId,
              email: record.email,
              email_normalized: record.email,
              role: record.role,
              token_hash: record.tokenHash,
              expires_at: record.expiresAt,
              consumed_at: null,
              revoked_at: null,
              invited_by: 'app-user-1',
              created_at: new Date('2028-01-01T00:00:00.000Z'),
            }],
            rowCount: 1,
          };
        }
        if (text.includes('UPDATE invites') && text.includes('token_hash = $3')) {
          return {
            rows: [{
              id: record.id,
              household_id: record.householdId,
              email_normalized: record.email,
              role: record.role,
              token_hash: newTokenHash,
              expires_at: new Date('2031-01-01T00:00:00.000Z'),
              consumed_at: null,
              revoked_at: null,
              invited_by: 'app-user-1',
              created_at: new Date('2028-01-01T00:00:00.000Z'),
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;
    const store = createPostgresInviteStore(pool);

    const pending = await store.getPendingInvite(record.householdId, record.id);
    expect(pending.id).toBe(record.id);
    expect(pending.tokenHash).toBe(record.tokenHash);

    const activated = await store.activateResentInvite({
      householdId: record.householdId,
      inviteId: record.id,
      expectedTokenHash: record.tokenHash,
      newTokenHash,
      newExpiresAt: new Date('2031-01-01T00:00:00.000Z'),
      now: new Date('2029-01-01T00:00:00.000Z'),
    });

    expect(activated.id).toBe(record.id);
    expect(activated.tokenHash).toBe(newTokenHash);
    expect(queries.some((q) => q.includes('token_hash = $3') && q.includes('token_hash = $4'))).toBe(true);
  });

  it('rejects activateResentInvite with 409 when CAS token_hash does not match in postgres store', async () => {
    const pool = {
      query: async (text: string) => {
        if (text.includes('UPDATE invites')) {
          // CAS mismatch (rowCount 0)
          return { rows: [], rowCount: 0 };
        }
        if (text.includes('SELECT id, consumed_at, revoked_at, token_hash FROM invites')) {
          // Invite exists but token_hash was already changed
          return {
            rows: [{
              id: record.id,
              consumed_at: null,
              revoked_at: null,
              token_hash: 'concurrent-newer-hash',
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;
    const store = createPostgresInviteStore(pool);

    await expect(store.activateResentInvite({
      householdId: record.householdId,
      inviteId: record.id,
      expectedTokenHash: 'stale-expected-hash',
      newTokenHash: 'new-hash-attempt',
      newExpiresAt: new Date('2031-01-01T00:00:00.000Z'),
      now: new Date('2029-01-01T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'invite.already_used', statusCode: 409 });
  });
});
