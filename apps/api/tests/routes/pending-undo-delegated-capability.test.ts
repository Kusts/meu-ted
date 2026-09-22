import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerPendingOperationRoutes } from '../../src/routes/pending-operations.js';

const legacyStore = {
  async get() { throw Object.assign(new Error('not found'), { code: 'approval.not_found' }); },
  async list() { return []; },
  async findByChatId() { return null; },
  async create() { throw new Error('unused'); },
  async approve() { throw new Error('unused'); },
  async reject() { throw new Error('unused'); },
};

const undoResult = { undone: { operation: 'transactions.expense.create', entityId: 'ent-1', reversal: 'soft_delete' } };

const scopedUndoApp = (capabilities: string[] | null) => {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    if (capabilities !== null) {
      request.delegatedTurn = {
        iss: 'pi-agent', aud: 'pi-finance-api', sub: 'actor-a', workspace: 'ws-a',
        role: 'member', capabilities, jti: crypto.randomUUID(), request: 'r',
        deviceId: 'device-a', iat: 1, exp: 301,
      };
    }
    request.authenticatedContext = {
      householdId: 'ws-a', actorId: 'actor-a', authUserId: 'actor-a',
      actorType: 'user', deviceId: 'device-a', role: 'member',
    };
  });
  registerPendingOperationRoutes(app, {
    store: legacyStore as never,
    resolveToken: async () => ({ householdId: 'ws-a', deviceId: 'device-a' }),
    undoService: { undo: async () => undoResult as never },
  });
  return app;
};

describe('debt-undo-confirmation-protocol: POST /pending-operations/undo delegated capability', () => {
  it('requires the narrow undo capability for delegated callers', async () => {
    const generic = scopedUndoApp(['financial.write']);
    const denied = await generic.inject({
      method: 'POST', url: '/pending-operations/undo',
      headers: { 'idempotency-key': 'undo:ws-a:req-1' },
      payload: {},
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: 'auth.delegation_scope_forbidden' });
  });

  it('accepts the narrow capability and keeps the device-token path unchanged', async () => {
    const narrow = scopedUndoApp(['financial.undo.execute']);
    const ok = await narrow.inject({
      method: 'POST', url: '/pending-operations/undo',
      headers: { 'idempotency-key': 'undo:ws-a:req-2' },
      payload: {},
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ undone: { reversal: 'soft_delete' } });

    const device = scopedUndoApp(null);
    const legacy = await device.inject({
      method: 'POST', url: '/pending-operations/undo',
      headers: { 'idempotency-key': 'undo:ws-a:req-3' },
      payload: {},
    });
    expect(legacy.statusCode).toBe(200);
  });
});
