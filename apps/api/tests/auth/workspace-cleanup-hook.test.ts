import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { createPostgresWorkspaceStore } from '../../src/auth/workspaces-postgres.js';

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';
const TARGET_USERS_ID = '22222222-2222-4222-8222-222222222222';
const SELF_USERS_ID = '33333333-3333-4333-8333-333333333333';

const mockPool = (handler: (text: string) => { rows: unknown[]; rowCount: number }): Pool => {
  const client = {
    query: async (text: string) => handler(text),
    release: () => undefined,
  };
  return {
    query: async (text: string) => handler(text),
    connect: async () => client,
  } as unknown as Pool;
};

describe('postgres workspace revocation hook (V4.1 task 1.6)', () => {
  it('invokes onMemberRevoked with the resolved user id after removeMember', async () => {
    const onMemberRevoked = vi.fn(async () => {});
    const pool = mockPool((text) => {
      if (text.includes('FROM users u')) return { rows: [{ user_id: SELF_USERS_ID, role: 'owner' }], rowCount: 1 };
      if (text.includes('FROM households')) return { rows: [{ kind: 'shared', owner_user_id: 'other' }], rowCount: 1 };
      if (text.includes('FROM users WHERE')) return { rows: [{ id: TARGET_USERS_ID, auth_user_id: 'member-auth' }], rowCount: 1 };
      if (text.includes('COUNT(*)')) return { rows: [{ count: 2 }], rowCount: 1 };
      if (text.includes("SET status = 'removed'")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const store = createPostgresWorkspaceStore(pool, { onMemberRevoked });

    await store.removeMember({ authUserId: 'owner-auth', householdId: HOUSEHOLD, memberUserId: 'member-auth' });

    expect(onMemberRevoked).toHaveBeenCalledTimes(1);
    expect(onMemberRevoked).toHaveBeenCalledWith({ userId: TARGET_USERS_ID, householdId: HOUSEHOLD });
  });

  it('skips onMemberRevoked when removeMember changes no membership row', async () => {
    const onMemberRevoked = vi.fn(async () => {});
    const pool = mockPool((text) => {
      if (text.includes('FROM users u')) return { rows: [{ user_id: SELF_USERS_ID, role: 'owner' }], rowCount: 1 };
      if (text.includes('FROM households')) return { rows: [{ kind: 'shared', owner_user_id: 'other' }], rowCount: 1 };
      if (text.includes('FROM users WHERE')) return { rows: [{ id: TARGET_USERS_ID, auth_user_id: 'ghost' }], rowCount: 1 };
      if (text.includes('COUNT(*)')) return { rows: [{ count: 2 }], rowCount: 1 };
      if (text.includes("SET status = 'removed'")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const store = createPostgresWorkspaceStore(pool, { onMemberRevoked });

    await store.removeMember({ authUserId: 'owner-auth', householdId: HOUSEHOLD, memberUserId: 'ghost' });

    expect(onMemberRevoked).not.toHaveBeenCalled();
  });

  it('invokes onMemberRevoked after leave', async () => {
    const onMemberRevoked = vi.fn(async () => {});
    const pool = mockPool((text) => {
      if (text.includes('FROM users u')) return { rows: [{ user_id: SELF_USERS_ID, role: 'member' }], rowCount: 1 };
      if (text.includes('FROM households')) return { rows: [{ kind: 'shared', owner_user_id: 'other' }], rowCount: 1 };
      if (text.includes("SET status = 'removed'")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const store = createPostgresWorkspaceStore(pool, { onMemberRevoked });

    await store.leave({ authUserId: 'member-auth', householdId: HOUSEHOLD });

    expect(onMemberRevoked).toHaveBeenCalledTimes(1);
    expect(onMemberRevoked).toHaveBeenCalledWith({ userId: SELF_USERS_ID, householdId: HOUSEHOLD });
  });
});
