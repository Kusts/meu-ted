import { describe, expect, it } from 'vitest';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { createPostgresPendingOperationStore } from '../../src/approvals/pending.js';

const baseRow = () => ({
  id: '00000000-0000-0000-0000-000000000001', workspace_id: 'workspace-1', requester_id: 'user-1',
  operation: 'transactions.expense.create', payload: { amountCents: 50_000 }, reason: 'high_value',
  idempotency_key: 'intent-1', status: 'pending', created_at: '2026-08-04T18:00:00.000Z',
  expires_at: '2099-08-04T18:30:00.000Z', approved_at: null,
});

type FakeDb = { row: ReturnType<typeof baseRow>; committed: boolean; rolledBack: boolean };

function makePool(): { pool: Pool; db: FakeDb } {
  const db: FakeDb = { row: baseRow(), committed: false, rolledBack: false };
  const result = <R extends QueryResultRow>(rows: unknown[]): QueryResult<R> => ({
    rows: rows as R[], rowCount: rows.length, command: 'TEST', oid: 0, fields: [],
  });
  const client = {
    async query<R extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<R>> {
      const upper = text.trim().toUpperCase();
      if (upper === 'BEGIN') return result<R>([]);
      if (upper === 'COMMIT') { db.committed = true; return result<R>([]); }
      if (upper === 'ROLLBACK') { db.row.status = 'pending'; db.rolledBack = true; return result<R>([]); }
      if (upper.startsWith('SELECT * FROM PENDING_OPERATIONS')) return result<R>([db.row]);
      if (upper.startsWith('UPDATE PENDING_OPERATIONS')) {
        db.row.status = text.includes("status = 'approved'") ? 'approved' : 'rejected';
        return result<R>([db.row]);
      }
      throw new Error(`unexpected SQL: ${text}`);
    },
    release() {},
  } as unknown as PoolClient;
  const pool = { connect: async () => client, query: client.query.bind(client) } as unknown as Pool;
  return { pool, db };
}

describe('Postgres pending operation execution', () => {
  it('claims, executes, and commits exactly once', async () => {
    const { pool, db } = makePool();
    const store = createPostgresPendingOperationStore(pool);
    let executions = 0;

    const result = await store.approve(db.row.id, 'workspace-1', 'user-1', async () => {
      executions += 1;
      return { transactionId: 'tx-1' };
    });

    expect(result).toMatchObject({ status: 'approved', execution: { transactionId: 'tx-1' } });
    expect(db.committed).toBe(true);
    const retried = await store.approve(db.row.id, 'workspace-1', 'user-1', async () => { executions += 1; });
    expect(retried).toMatchObject({ status: 'approved' });
    expect(executions).toBe(1);
  });

  it('rolls back the approval when execution fails', async () => {
    const { pool, db } = makePool();
    const store = createPostgresPendingOperationStore(pool);

    await expect(store.approve(db.row.id, 'workspace-1', 'user-1', async () => {
      throw new Error('effect failed');
    })).rejects.toThrow('effect failed');

    expect(db.rolledBack).toBe(true);
    expect(db.row.status).toBe('pending');
  });
});
