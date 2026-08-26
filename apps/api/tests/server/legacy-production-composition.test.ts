import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { verifySchema } from '../../src/server/schema-verifier.js';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';
import { registerPostgresProductionRoutes } from '../../src/server/production-routes.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createBetterAuth } from '../../src/auth/better-auth.js';

const legacyColumns = [
  ['_migrations', 'version'], ['accounts', 'id'], ['accounts', 'household_id'],
  ['categories', 'id'], ['categories', 'household_id'], ['transactions', 'id'], ['transactions', 'household_id'],
  ['device_tokens', 'token'], ['device_tokens', 'household_id'],
  ['operation_records', 'id'], ['operation_records', 'workspace_id'], ['operation_records', 'actor_type'], ['operation_records', 'actor_id'], ['operation_records', 'status'],
  ['operation_records', 'lease_until'], ['operation_records', 'retry_until'], ['operation_records', 'retention_until'],
  ['audit_logs', 'id'], ['audit_logs', 'household_id'], ['audit_logs', 'user_id'], ['audit_logs', 'action'],
  ['audit_logs', 'entity_type'], ['audit_logs', 'entity_id'], ['audit_logs', 'before_json'], ['audit_logs', 'after_json'],
].map(([table_name, column_name]) => ({ table_name, column_name }));

const legacyPool = {
  async query(sql: string, values: unknown[] = []) {
    if (sql.includes('information_schema.columns')) return { rows: legacyColumns };
    if (sql.includes('FROM _migrations')) return { rows: expectedMigrationManifest(true) };
    if (sql.includes('FROM device_tokens')) return { rows: [{ device_id: 'legacy-device', household_id: HOUSEHOLD_A }] };
    if (sql.includes('FROM audit_logs')) {
      const matches = values.includes('account') && values.includes('00000000-0000-4000-8000-0000000000a1');
      return { rows: matches ? [{
        id: 'legacy-log-1', household_id: HOUSEHOLD_A, user_id: null, action: 'create',
        entity_type: 'account', entity_id: '00000000-0000-4000-8000-0000000000a1', before_json: { old: true },
        after_json: { old: false }, created_at: '2026-07-31T10:00:00.000Z', total_count: '1',
      }] : [] };
    }
    throw new Error(`unexpected query: ${sql}`);
  },
} as unknown as Pool;

describe('legacy production composition', () => {
  it('verifies legacy schema and serves the audit API through production wiring', async () => {
    await expect(verifySchema(legacyPool, true)).resolves.toBe(true);
    const app = Fastify({ logger: false });
    registerPostgresProductionRoutes(app, legacyPool, true, HOUSEHOLD_A);

    const response = await app.inject({
      method: 'GET',
      url: '/audit-logs?entityType=account&entityId=00000000-0000-4000-8000-0000000000a1',
      headers: { 'x-device-token': `${HOUSEHOLD_A}.legacy-token` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 1, items: [{ id: 'legacy-log-1', metadata: { before: { old: true }, after: { old: false } } }] });

    const nonmatch = await app.inject({
      method: 'GET',
      url: '/audit-logs?entityType=category&entityId=00000000-0000-4000-8000-0000000000a1',
      headers: { 'x-device-token': `${HOUSEHOLD_A}.legacy-token` },
    });
    expect(nonmatch.statusCode).toBe(200);
    expect(nonmatch.json()).toMatchObject({ total: 0, items: [] });
  });

  it('mounts invite routes in both legacy and canonical production compositions', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });
    const delivery = async () => undefined;
    const legacyApp = Fastify({ logger: false });
    const canonicalApp = Fastify({ logger: false });
    registerPostgresProductionRoutes(legacyApp, legacyPool, true, HOUSEHOLD_A, auth, delivery);
    registerPostgresProductionRoutes(canonicalApp, legacyPool, false, HOUSEHOLD_A, auth, delivery);

    const [legacyResponse, canonicalResponse] = await Promise.all([
      legacyApp.inject({ method: 'POST', url: '/auth/invites', payload: {} }),
      canonicalApp.inject({ method: 'POST', url: '/auth/invites', payload: {} }),
    ]);

    expect(legacyResponse.statusCode).toBe(401);
    expect(canonicalResponse.statusCode).toBe(401);
    await legacyApp.close();
    await canonicalApp.close();
    await auth.close();
  });

  it('serves canonical entity filters through production HTTP wiring', async () => {
    const canonicalPool = {
      async query(sql: string, values: unknown[] = []) {
        if (sql.includes('information_schema.columns')) return { rows: legacyColumns };
        if (sql.includes('FROM _migrations')) return { rows: expectedMigrationManifest(false) };
        if (sql.includes('FROM device_tokens')) return { rows: [{ device_id: 'canonical-device', household_id: HOUSEHOLD_A }] };
        if (sql.includes('FROM audit_logs')) {
          const matches = values.includes('account') && values.includes('00000000-0000-4000-8000-0000000000a1');
          return { rows: matches ? [{
            id: 'canonical-log-1', workspace_id: HOUSEHOLD_A, actor_type: 'device', actor_id: 'canonical-device',
            operation: 'accounts.create', event_type: 'financial_effect.committed', payload_hash: 'hash',
            effect_ref: '00000000-0000-4000-8000-0000000000a1', metadata: { entityType: 'account' },
            created_at: '2026-07-31T10:00:00.000Z', total_count: '1',
          }] : [] };
        }
        throw new Error(`unexpected query: ${sql}`);
      },
    } as unknown as Pool;
    const app = Fastify({ logger: false });
    registerPostgresProductionRoutes(app, canonicalPool, false, HOUSEHOLD_A);

    const match = await app.inject({
      method: 'GET',
      url: '/audit-logs?entityType=account&entityId=00000000-0000-4000-8000-0000000000a1',
      headers: { 'x-device-token': `${HOUSEHOLD_A}.canonical-token` },
    });
    expect(match.statusCode).toBe(200);
    expect(match.json()).toMatchObject({ total: 1, items: [{ id: 'canonical-log-1' }] });

    const nonmatch = await app.inject({
      method: 'GET',
      url: '/audit-logs?entityType=category&entityId=00000000-0000-4000-8000-0000000000a1',
      headers: { 'x-device-token': `${HOUSEHOLD_A}.canonical-token` },
    });
    expect(nonmatch.statusCode).toBe(200);
    expect(nonmatch.json()).toMatchObject({ total: 0, items: [] });
  });
});
