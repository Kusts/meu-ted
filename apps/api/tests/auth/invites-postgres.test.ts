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
});
