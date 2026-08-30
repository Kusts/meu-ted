import Fastify from 'fastify';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { createBetterAuth } from '../../src/auth/better-auth.js';
import { registerWorkspaceRoutes, type WorkspaceStore } from '../../src/auth/workspaces-http.js';
import { createPostgresIdempotencyStore } from '../../src/writes/postgres.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const auth = {
  api: {
    getSession: async () => ({
      user: { id: 'auth-user-1', email: 'owner@example.com' },
      session: { id: 'session-1' },
    }),
  },
} as unknown as ReturnType<typeof createBetterAuth>;

type OperationRecord = {
  id: string;
  workspace_id: string;
  idempotency_key: string;
  payload_hash: string;
  status: string;
  response: unknown;
};

describe('POST /workspaces Postgres idempotency UUID contract', () => {
  it('creates a workspace with valid idempotency key, succeeds with 201 and replays safely without second store execution', async () => {
    const app = Fastify({ logger: false });
    const store: WorkspaceStore = {
      list: vi.fn(async () => []),
      create: vi.fn(async () => ({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Minha Empresa',
        kind: 'shared',
        role: 'owner',
        status: 'active',
      })),
      listMembers: vi.fn(async () => []),
      removeMember: vi.fn(async () => undefined),
      leave: vi.fn(async () => undefined),
    };

    const operationRecords = new Map<string, OperationRecord>();

    const client = {
      query: async (text: string, values?: unknown[]) => {
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
          return { rows: [], rowCount: 0 };
        }
        if (text.includes('INSERT INTO operation_records')) {
          const workspaceId = values?.[0] as string;
          const idempotencyKey = values?.[3] as string;
          const payloadHash = values?.[4] as string;
          if (typeof workspaceId !== 'string' || !UUID_REGEX.test(workspaceId)) {
            const error = new Error(`invalid input syntax for type uuid: "${String(workspaceId)}"`);
            (error as unknown as { code: string }).code = '22P02';
            throw error;
          }
          const compositeKey = `${workspaceId}:${idempotencyKey}`;
          if (operationRecords.has(compositeKey)) {
            return { rows: [], rowCount: 0 };
          }
          const record: OperationRecord = {
            id: '00000000-0000-4000-8000-000000000001',
            workspace_id: workspaceId,
            idempotency_key: idempotencyKey,
            payload_hash: payloadHash,
            status: 'processing',
            response: null,
          };
          operationRecords.set(compositeKey, record);
          return {
            rows: [{
              id: record.id,
              status: record.status,
              response: record.response,
              effect_ref: null,
            }],
            rowCount: 1,
          };
        }
        if (text.includes('UPDATE operation_records')) {
          const recordId = values?.[0] as string;
          const workspaceId = values?.[1] as string;
          const responseJson = values?.[2] as string;
          for (const rec of operationRecords.values()) {
            if (rec.id === recordId && rec.workspace_id === workspaceId) {
              rec.status = 'completed';
              rec.response = typeof responseJson === 'string' ? JSON.parse(responseJson) : responseJson;
            }
          }
          return { rows: [], rowCount: 1 };
        }
        if (text.includes('SELECT') && text.includes('FROM operation_records')) {
          const workspaceId = values?.[0] as string;
          const compositeKey = values?.[1] as string;
          for (const [key, rec] of operationRecords.entries()) {
            if (key === `${workspaceId}:${compositeKey}` || (rec.workspace_id === workspaceId && rec.idempotency_key === compositeKey)) {
              return {
                rows: [{
                  id: rec.id,
                  status: rec.status,
                  response: rec.response,
                  payload_hash: rec.payload_hash,
                }],
                rowCount: 1,
              };
            }
          }
          return { rows: [], rowCount: 0 };
        }
        if (text.includes('INSERT INTO audit_logs')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      release: vi.fn(() => undefined),
    };

    const pool = {
      query: async (text: string, values?: unknown[]) => client.query(text, values),
      connect: async () => client,
    } as unknown as Pool;

    const idempotency = createPostgresIdempotencyStore({ pool });
    registerWorkspaceRoutes(app, { auth, store, idempotency });
    await app.ready();

    // First execution: creates workspace
    const firstResponse = await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: {
        'idempotency-key': 'create-workspace-key-1',
      },
      payload: {
        name: 'Minha Empresa',
        kind: 'shared',
      },
    });

    expect(firstResponse.statusCode).toBe(201);
    expect(firstResponse.json()).toMatchObject({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Minha Empresa',
      kind: 'shared',
    });
    expect(store.create).toHaveBeenCalledTimes(1);
    expect(store.create).toHaveBeenCalledWith({
      authUserId: 'auth-user-1',
      name: 'Minha Empresa',
      kind: 'shared',
    });

    // Second execution (replay): returns same response without calling store.create again
    const replayResponse = await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: {
        'idempotency-key': 'create-workspace-key-1',
      },
      payload: {
        name: 'Minha Empresa',
        kind: 'shared',
      },
    });

    expect(replayResponse.statusCode).toBe(201);
    expect(replayResponse.headers['idempotent-replayed']).toBe('true');
    expect(replayResponse.json()).toMatchObject({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Minha Empresa',
      kind: 'shared',
    });
    expect(store.create).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('ensures the store producer is never executed when the idempotency claim fails on invalid UUID workspace_id', async () => {
    const client = {
      query: async (text: string, values?: unknown[]) => {
        if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
          return { rows: [], rowCount: 0 };
        }
        if (text.includes('INSERT INTO operation_records')) {
          const workspaceId = values?.[0];
          if (typeof workspaceId !== 'string' || !UUID_REGEX.test(workspaceId)) {
            const error = new Error(`invalid input syntax for type uuid: "${String(workspaceId)}"`);
            (error as unknown as { code: string }).code = '22P02';
            throw error;
          }
          return {
            rows: [{
              id: '00000000-0000-4000-8000-000000000001',
              status: 'processing',
              response: null,
              effect_ref: null,
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
      release: vi.fn(() => undefined),
    };

    const pool = {
      query: async (text: string, values?: unknown[]) => client.query(text, values),
      connect: async () => client,
    } as unknown as Pool;

    const idempotency = createPostgresIdempotencyStore({ pool });
    const producer = vi.fn(async () => ({ status: 201, body: { id: 'workspace-created' } }));

    await expect(
      idempotency.lookupOrRecord(
        {
          workspaceId: 'workspace:create',
          actorType: 'user',
          actorId: 'auth-user-1',
          operation: 'workspace.create',
          key: 'direct-claim-fail-test',
        },
        { name: 'Invalid Workspace' },
        producer,
      ),
    ).rejects.toThrow(/invalid input syntax for type uuid: "workspace:create"/i);

    expect(producer).not.toHaveBeenCalled();
  });
});
