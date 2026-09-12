import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { createPostgresWorkspaceAccessStore } from '../../src/auth/workspace-access.js';

describe('createPostgresWorkspaceAccessStore', () => {
  const DOMAIN_USER_ID = 'adbb7007-7b8d-4cf3-8c86-e1057c43f4ff';
  const AUTH_USER_ID = 'WUCGTzoQ7LRRe8eftJjFyKowx96Ryrbs';
  const HOUSEHOLD_ID = '550e8400-e29b-41d4-a716-446655440000';

  it('queries with support for both auth_user_id and domain user UUID', async () => {
    const executedQueries: Array<{ text: string; values?: unknown[] }> = [];
    const client = {
      query: async (text: string, values?: unknown[]) => {
        executedQueries.push({ text, values });
        if (text.includes('FROM users u') && (values?.[0] === AUTH_USER_ID || values?.[0] === DOMAIN_USER_ID)) {
          return {
            rows: [
              {
                user_id: DOMAIN_USER_ID,
                household_id: HOUSEHOLD_ID,
                role: 'owner',
                kind: 'personal',
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    };
    const pool = {
      query: async (text: string, values?: unknown[]) => client.query(text, values),
      connect: async () => client,
    } as unknown as Pool;

    const store = createPostgresWorkspaceAccessStore(pool);

    // 1. Resolve via Better-Auth ID (e.g. from session)
    const accessByAuthId = await store.resolve(AUTH_USER_ID, HOUSEHOLD_ID);
    expect(accessByAuthId).toEqual({
      userId: DOMAIN_USER_ID,
      householdId: HOUSEHOLD_ID,
      role: 'owner',
      kind: 'personal',
    });

    // 2. Resolve via domain user UUID (e.g. from connection token actorId / claims.sub)
    const accessByDomainId = await store.resolve(DOMAIN_USER_ID, HOUSEHOLD_ID);
    expect(accessByDomainId).toEqual({
      userId: DOMAIN_USER_ID,
      householdId: HOUSEHOLD_ID,
      role: 'owner',
      kind: 'personal',
    });

    // 3. Verify SQL query checks both auth_user_id and id::text
    const query = executedQueries[0]?.text ?? '';
    expect(query).toMatch(/u\.auth_user_id\s*=\s*\$1\s+OR\s+u\.id::text\s*=\s*\$1/i);
  });

  it('returns undefined when user or membership is not found / inactive', async () => {
    const client = {
      query: async () => ({ rows: [], rowCount: 0 }),
      release: () => undefined,
    };
    const pool = {
      query: async (text: string, values?: unknown[]) => client.query(text, values),
      connect: async () => client,
    } as unknown as Pool;

    const store = createPostgresWorkspaceAccessStore(pool);
    const result = await store.resolve('non-existent-user', HOUSEHOLD_ID);
    expect(result).toBeUndefined();
  });
});
