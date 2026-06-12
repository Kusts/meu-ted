/**
 * Database connection — Postgres via pg Pool
 * Singleton pool initialized from DATABASE_URL env var.
 * All queries go through this pool — no financial logic here.
 */

import pg, { type QueryResultRow } from 'pg';

const { Pool } = pg;

let _pool: pg.Pool | null = null;

/**
 * Get or create the Postgres pool singleton.
 * Must be called after env vars are loaded.
 */
export function getPool(): pg.Pool {
  if (!_pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    _pool = new Pool({ connectionString: databaseUrl });
  }
  return _pool;
}

/**
 * Execute a query with parameters.
 * Returns the result directly from pg — no wrapping, no business logic.
 *
 * Generic T defaults to QueryResultRow for backward compatibility.
 * We accept any `object` type (including plain interfaces without index signatures)
 * so that callers like `AccountInfo`, `BalanceAggregate` etc. don't need to extend
 * QueryResultRow — only structural field compatibility with the SQL result is required.
 *
 * The pool.query internally requires QueryResultRow; the cast is centralized here
 * so callers stay type-safe on their end (T is what they declared, rows are typed as T[]).
 */
export async function query<T extends object = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const pool = getPool();
  // Cast is centralized: T is the caller's declared row type; pool needs QueryResultRow.
  // The result.rows is typed as T[] via the return type, so callers get correct types.
  const r = await pool.query<T & QueryResultRow>(text, params);
  return r as unknown as pg.QueryResult<T>;
}

/**
 * Execute a transaction (multi-statement atomic operation).
 * Calls the callback with a client from the pool.
 */
export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Close the pool (for graceful shutdown).
 */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

/**
 * Health check — verifies DB connectivity.
 * Returns true if pool can execute a simple query.
 */
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    const result = await query<{ healthy: number }>('SELECT 1 as healthy');
    return result.rows.length > 0 && result.rows[0].healthy === 1;
  } catch {
    return false;
  }
}