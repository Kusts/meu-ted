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
  betterAuthSecret: string;
  betterAuthUrl: string;
  trustedOrigins: string[];
  disableSignUp: boolean;
  disableDeviceRegistration: boolean;
  adminEmails: string[];
  agentConnectionSecret: string;
  agentConfigToken: string;
  agentAuthServiceToken: string;
  agentRuntimeOrigin: string;
  agentRuntimeAdminToken: string;
};

export const loadConfig = (): AppConfig => {
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? '0.0.0.0';
  const databaseUrl = process.env.DATABASE_URL?.trim() || null;
  const defaultHouseholdId = process.env.DEFAULT_HOUSEHOLD_ID?.trim() || '11111111-1111-4111-8111-111111111111';
  const betterAuthSecret = process.env.BETTER_AUTH_SECRET?.trim() || 'pi-financeiro-dev-secret-at-least-32-chars!';
  const betterAuthUrl = process.env.BETTER_AUTH_URL?.trim() || process.env.API_BASE_URL?.trim() || (process.env.NODE_ENV === 'production' ? 'https://api.synkroo.com.br' : `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  const defaultOrigins = [
    'https://pi-finance-pwa.walissonead.workers.dev',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ];
  const envOrigins = process.env.TRUSTED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
  const trustedOrigins = envOrigins && envOrigins.length > 0 ? envOrigins : defaultOrigins;
  const disableSignUp = process.env.DISABLE_SIGN_UP !== 'false';
  const disableDeviceRegistration = process.env.DISABLE_DEVICE_REGISTRATION !== 'false';
  const adminEmails = (process.env.ADMIN_EMAILS ?? 'walissonead@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return {
    port,
    host,
    databaseUrl,
    defaultHouseholdId,
    betterAuthSecret,
    betterAuthUrl,
    trustedOrigins,
    disableSignUp,
    disableDeviceRegistration,
    adminEmails,
    agentConnectionSecret: process.env.AGENT_CONNECTION_TOKEN_SECRET?.trim() || 'dev-agent-connection-secret-at-least-32-chars!',
    agentConfigToken: process.env.AGENT_CONFIG_TOKEN?.trim() || 'dev-agent-config-token-32-chars-minimum!',
    agentAuthServiceToken: process.env.AGENT_AUTH_SERVICE_TOKEN?.trim() || 'dev-agent-auth-service-token-32-chars!',
    agentRuntimeOrigin: process.env.AGENT_RUNTIME_ORIGIN?.trim() || 'https://pi-finance-agent.walissonead.workers.dev',
    agentRuntimeAdminToken: process.env.AGENT_RUNTIME_ADMIN_TOKEN?.trim() || 'dev-agent-runtime-admin-token-32-chars!',
  };
};
