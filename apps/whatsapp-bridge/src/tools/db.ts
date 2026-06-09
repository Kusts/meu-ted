/**
 * Database connection — Postgres via pg Pool
 * Singleton pool initialized from DATABASE_URL env var.
 * All queries go through this pool — no financial logic here.
 */

import pg from 'pg';

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
 */
export async function query<T>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const pool = getPool();
  const r = await pool.query(text, params);
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