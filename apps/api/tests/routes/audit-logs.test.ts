import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import { HOUSEHOLD_A, HOUSEHOLD_B } from '../fixtures/seed.js';
import { createLegacyPostgresAuditLogStore } from '../../src/audit/store.js';
import type { Pool } from 'pg';

const auth = (token: string) => ({ 'x-device-token': token });

describe('GET /audit-logs — canonical audit capability', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/audit-logs' });
    expect(response.statusCode).toBe(401);
  });

  it('returns only the authenticated household audit records with filters', async () => {
    const { app } = buildTestApp({
      auditLogs: [
        { id: 'log-a1', workspaceId: HOUSEHOLD_A, actorType: 'device', actorId: 'device-a', operation: 'accounts.create', eventType: 'financial_effect.committed', payloadHash: 'hash-a', effectRef: '00000000-0000-4000-8000-0000000000a1', metadata: { entityType: 'account' }, createdAt: '2026-07-31T12:00:00.000Z' },
        { id: 'log-a2', workspaceId: HOUSEHOLD_A, actorType: 'user', actorId: 'user-a', operation: 'accounts.update', eventType: 'financial_effect.committed', payloadHash: 'hash-b', effectRef: '00000000-0000-4000-8000-0000000000a1', metadata: { entityType: 'account' }, createdAt: '2026-07-31T11:00:00.000Z' },
        { id: 'log-b1', workspaceId: HOUSEHOLD_B, actorType: 'device', actorId: 'device-b', operation: 'accounts.create', eventType: 'financial_effect.committed', payloadHash: 'hash-c', effectRef: '00000000-0000-4000-8000-0000000000b1', metadata: { entityType: 'account' }, createdAt: '2026-07-31T13:00:00.000Z' },
      ],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/audit-logs?operation=accounts.create&actorType=device&limit=1',
      headers: auth(TOKEN_A),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 1, items: [{ id: 'log-a1', workspaceId: HOUSEHOLD_A, actorType: 'device', operation: 'accounts.create' }] });

    const entityMatch = await app.inject({ method: 'GET', url: '/audit-logs?entityType=account&entityId=00000000-0000-4000-8000-0000000000a1', headers: auth(TOKEN_A) });
    expect(entityMatch.statusCode).toBe(200);
    expect(entityMatch.json()).toMatchObject({ total: 2, items: [{ id: 'log-a1' }, { id: 'log-a2' }] });

    const entityMiss = await app.inject({ method: 'GET', url: '/audit-logs?entityType=category&entityId=00000000-0000-4000-8000-0000000000a1', headers: auth(TOKEN_A) });
    expect(entityMiss.statusCode).toBe(200);
    expect(entityMiss.json()).toMatchObject({ total: 0, items: [] });
  });

  it('serves the legacy production schema through the same API contract', async () => {
    const legacyPool = {
      query: async (sql: string) => {
        expect(sql).toContain('household_id = $1');
        expect(sql).toContain('action');
        expect(sql).toContain('entity_type');
        expect(sql).toContain('entity_id');
        expect(sql).not.toContain('workspace_id');
        return {
          rows: [{
            id: 'legacy-log-1', household_id: HOUSEHOLD_A, user_id: null, action: 'create',
            entity_type: 'account', entity_id: '00000000-0000-4000-8000-0000000000a1', before_json: { name: 'Conta anterior' },
            after_json: { name: 'Conta antiga' }, created_at: '2026-07-31T10:00:00.000Z', total_count: '1',
          }],
        };
      },
    } as unknown as Pool;
    const { app } = buildTestApp({}, undefined, createLegacyPostgresAuditLogStore(legacyPool));
    const response = await app.inject({ method: 'GET', url: '/audit-logs?actorType=device&entityType=account&entityId=00000000-0000-4000-8000-0000000000a1', headers: auth(TOKEN_A) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 1, items: [{ id: 'legacy-log-1', workspaceId: HOUSEHOLD_A, actorType: 'device', operation: 'create', eventType: 'legacy.create', effectRef: '00000000-0000-4000-8000-0000000000a1', metadata: { entityType: 'account', before: { name: 'Conta anterior' }, after: { name: 'Conta antiga' } } }] });
  });

  it('rejects invalid query values', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/audit-logs?limit=101', headers: auth(TOKEN_B) });
    expect(response.statusCode).toBe(400);
  });
});
