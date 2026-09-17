import { describe, expect, it } from 'vitest';
import {
  createPool,
  DEFAULT_CONNECTION_TIMEOUT_MILLIS,
  DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MILLIS,
  DEFAULT_LOCK_TIMEOUT_MILLIS,
  DEFAULT_STATEMENT_TIMEOUT_MILLIS,
  resolvePoolTimeouts,
  sessionTimeoutStatements,
} from '../../src/db/pool.js';

describe('DB pool hardening (V4.1 Phase 8, task 8.7)', () => {
  it('resolves production-safe defaults when nothing is configured', () => {
    const t = resolvePoolTimeouts({ connectionString: 'postgres://localhost/x' }, {});
    expect(t).toEqual({
      connectionTimeoutMillis: DEFAULT_CONNECTION_TIMEOUT_MILLIS,
      statementTimeoutMillis: DEFAULT_STATEMENT_TIMEOUT_MILLIS,
      lockTimeoutMillis: DEFAULT_LOCK_TIMEOUT_MILLIS,
      idleInTransactionSessionTimeoutMillis: DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MILLIS,
    });
    expect(DEFAULT_CONNECTION_TIMEOUT_MILLIS).toBe(10_000);
    expect(DEFAULT_STATEMENT_TIMEOUT_MILLIS).toBe(30_000);
    expect(DEFAULT_LOCK_TIMEOUT_MILLIS).toBe(10_000);
    expect(DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MILLIS).toBe(15_000);
  });

  it('prefers explicit config over env over defaults', () => {
    const env = {
      PI_DB_STATEMENT_TIMEOUT_MS: '5000',
      PI_DB_LOCK_TIMEOUT_MS: '5000',
      PI_DB_IDLE_IN_TX_TIMEOUT_MS: '5000',
      PI_DB_CONNECTION_TIMEOUT_MS: '5000',
    };
    const fromEnv = resolvePoolTimeouts({ connectionString: 'postgres://localhost/x' }, env);
    expect(fromEnv.statementTimeoutMillis).toBe(5000);
    const explicit = resolvePoolTimeouts(
      { connectionString: 'postgres://localhost/x', statementTimeoutMillis: 60_000 },
      env,
    );
    expect(explicit.statementTimeoutMillis).toBe(60_000);
  });

  it('emits session SET statements for every timeout', () => {
    const statements = sessionTimeoutStatements({
      connectionTimeoutMillis: 10_000,
      statementTimeoutMillis: 30_000,
      lockTimeoutMillis: 10_000,
      idleInTransactionSessionTimeoutMillis: 15_000,
    });
    expect(statements).toContain('SET statement_timeout = 30000');
    expect(statements).toContain('SET lock_timeout = 10000');
    expect(statements).toContain('SET idle_in_transaction_session_timeout = 15000');
  });

  it('wires connectionTimeoutMillis into pg and applies session timeouts on connect', async () => {
    const pool = createPool({ connectionString: 'postgres://localhost/x' });
    try {
      expect((pool as unknown as { options: { connectionTimeoutMillis: number } }).options.connectionTimeoutMillis).toBe(
        DEFAULT_CONNECTION_TIMEOUT_MILLIS,
      );
      const queries: string[] = [];
      (pool as unknown as { emit: (event: string, client: unknown) => void }).emit('connect', {
        query: async (sql: string) => {
          queries.push(sql);
          return { rows: [] };
        },
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(queries.join(';')).toContain('statement_timeout');
      expect(queries.join(';')).toContain('lock_timeout');
      expect(queries.join(';')).toContain('idle_in_transaction_session_timeout');
    } finally {
      await pool.end().catch(() => undefined);
    }
  });
});
