/**
 * Postgres connection pool factory.
 *
 * DATABASE_URL is the single source of truth for connection params.
 * sslmode defaults to "prefer" so dev DBs without TLS still work; set
 * sslmode=require in production via DATABASE_URL.
 */

import pg from "pg";

export type DbPool = pg.Pool;

export type DbConfig = {
  connectionString: string;
  /** Default: 4. Set higher in production. */
  max?: number;
  /** Default: 10s. */
  idleTimeoutMillis?: number;
  /** Default: 10s. Env: PI_DB_CONNECTION_TIMEOUT_MS. */
  connectionTimeoutMillis?: number;
  /**
   * Default: 30s. Env: PI_DB_STATEMENT_TIMEOUT_MS.
   * Long-running migration scripts should pass an explicit higher value
   * (or set the env) instead of relying on the API default.
   */
  statementTimeoutMillis?: number;
  /** Default: 10s. Env: PI_DB_LOCK_TIMEOUT_MS. */
  lockTimeoutMillis?: number;
  /** Default: 15s. Env: PI_DB_IDLE_IN_TX_TIMEOUT_MS. */
  idleInTransactionSessionTimeoutMillis?: number;
};

/**
 * Production-safe timeout defaults (V4.1 Phase 8, task 8.7): fail fast on
 * stuck checkouts/statements/locks instead of queueing behind contention.
 * Raising pool size alone is never the fix for contention.
 */
export const DEFAULT_CONNECTION_TIMEOUT_MILLIS = 10_000;
export const DEFAULT_STATEMENT_TIMEOUT_MILLIS = 30_000;
export const DEFAULT_LOCK_TIMEOUT_MILLIS = 10_000;
export const DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MILLIS = 15_000;

export type PoolTimeouts = {
  connectionTimeoutMillis: number;
  statementTimeoutMillis: number;
  lockTimeoutMillis: number;
  idleInTransactionSessionTimeoutMillis: number;
};

const numericEnv = (
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number => {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

/** Explicit config wins, then PI_DB_* env, then production-safe defaults. */
export const resolvePoolTimeouts = (
  config: DbConfig,
  env: Record<string, string | undefined> = process.env,
): PoolTimeouts => ({
  connectionTimeoutMillis:
    config.connectionTimeoutMillis ??
    numericEnv(env, 'PI_DB_CONNECTION_TIMEOUT_MS', DEFAULT_CONNECTION_TIMEOUT_MILLIS),
  statementTimeoutMillis:
    config.statementTimeoutMillis ??
    numericEnv(env, 'PI_DB_STATEMENT_TIMEOUT_MS', DEFAULT_STATEMENT_TIMEOUT_MILLIS),
  lockTimeoutMillis:
    config.lockTimeoutMillis ??
    numericEnv(env, 'PI_DB_LOCK_TIMEOUT_MS', DEFAULT_LOCK_TIMEOUT_MILLIS),
  idleInTransactionSessionTimeoutMillis:
    config.idleInTransactionSessionTimeoutMillis ??
    numericEnv(env, 'PI_DB_IDLE_IN_TX_TIMEOUT_MS', DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MILLIS),
});

/**
 * Session-level `SET` statements applied on every new connection (pg does
 * not forward these knobs as startup parameters, so `pool.on('connect')`
 * is the enforcement point). Values are integers validated above — safe
 * to interpolate.
 */
export const sessionTimeoutStatements = (timeouts: PoolTimeouts): string[] => [
  `SET statement_timeout = ${timeouts.statementTimeoutMillis}`,
  `SET lock_timeout = ${timeouts.lockTimeoutMillis}`,
  `SET idle_in_transaction_session_timeout = ${timeouts.idleInTransactionSessionTimeoutMillis}`,
];

export const createPool = (config: DbConfig): DbPool => {
  if (!config.connectionString) {
    throw new Error("createPool: connectionString is required");
  }
  const timeouts = resolvePoolTimeouts(config);
  const pool = new pg.Pool({
    connectionString: config.connectionString,
    max: config.max ?? 4,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 10_000,
    connectionTimeoutMillis: timeouts.connectionTimeoutMillis,
  });
  pool.on('connect', (client: pg.PoolClient) => {
    const statements = sessionTimeoutStatements(timeouts);
    client.query(statements.join('; ')).catch(() => {
      // A failed SET must not take the connection down; the query will
      // surface the underlying problem on first use.
    });
  });
  return pool;
};

/** Run a single query through the pool. */
export const queryInTransaction = async <
  T extends pg.QueryResultRow = pg.QueryResultRow,
>(
  pool: DbPool,
  text: string,
  values?: unknown[],
): Promise<pg.QueryResult<T>> => pool.query<T>(text, values);

/**
 * Run a callback inside a transaction. Rolls back on throw.
 */
export const withTransaction = async <T>(
  pool: DbPool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
};
