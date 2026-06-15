/**
 * Env loading for pi-finance-api.
 *
 * DATABASE_URL is optional in V1 (in-memory is the dev/test fallback).
 * When set, the API uses Postgres. Same env shape works in dev, test,
 * and prod. Connection string parsing is delegated to node-postgres.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const loadDotEnv = (): void => {
  // Tiny .env loader: KEY=VALUE, # comments, blank lines. No escaping.
  // Intentionally minimal — we don't add dotenv as a dep for one file.
  const dir = fileURLToPath(new URL('.', import.meta.url));
  const candidates = [
    join(dir, '..', '.env'),
    join(dir, '..', '..', '.env'),
    process.cwd() + '/.env',
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    break;
  }
};
loadDotEnv();

export type AppConfig = {
  port: number;
  host: string;
  databaseUrl: string | null;
  defaultHouseholdId: string;
};

export const loadConfig = (): AppConfig => {
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '0.0.0.0';
  const databaseUrl = process.env.DATABASE_URL?.trim() || null;
  const defaultHouseholdId = process.env.DEFAULT_HOUSEHOLD_ID?.trim() || '11111111-1111-4111-8111-111111111111';
  return { port, host, databaseUrl, defaultHouseholdId };
};
