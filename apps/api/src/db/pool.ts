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
};

export const createPool = (config: DbConfig): DbPool => {
  if (!config.connectionString) {
    throw new Error("createPool: connectionString is required");
  }
  return new pg.Pool({
    connectionString: config.connectionString,
    max: config.max ?? 4,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 10_000,
  });
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
