// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL Client - pi-financeiro
// ─────────────────────────────────────────────────────────────────────────────

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export interface DbClient {
  db: ReturnType<typeof drizzle<typeof schema>>;
  client: ReturnType<typeof postgres>;
}

/**
 * Create a database client for pi-financeiro
 * Uses postgres driver with drizzle ORM
 */
export function createDbClient(databaseUrl?: string): DbClient {
  const url = databaseUrl ?? process.env.DATABASE_URL ?? 'postgresql://pi_financeiro:pi_financeiro_dev_secret@localhost:5432/pi_financeiro';
  
  const client = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  
  const db = drizzle(client, { schema });
  
  return { db, client };
}

/**
 * Close database client connection
 */
export function closeDbClient(client: DbClient): Promise<void> {
  return client.client.end();
}
