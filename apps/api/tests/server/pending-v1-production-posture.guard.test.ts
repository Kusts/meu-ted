import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInMemoryPendingOperationV2Store } from '../../src/approvals/pending-v2.js';
import { registerPendingOperationRoutes } from '../../src/routes/pending-operations.js';

const serverSource = readFileSync(new URL('../../src/server/index.ts', import.meta.url), 'utf8');

/**
 * Phase 7 (V4.1 Tasks 7.1-7.4): Pending Operations V1 production posture.
 *
 * Consumer scan (2026-09-17) proved V1 still has runtime consumers, so the
 * V1 routes stay mounted for now:
 * - apps/agent/src/generated/http-tools.ts: get_pending_operation
 *   (GET /pending-operations/details), confirm_pending_operation
 *   (POST /pending-operations/approve), cancel_pending_operation
 *   (POST /pending-operations/reject), undo_last_action
 *   (POST /pending-operations/undo) — curated into the agent toolset
 *   (agent-config/tools.ts, skills compromissos.ts/registros.ts).
 * - PWA reaches pending state only via the Agent relay
 *   (GET /rpc/pending-operations/active → API V2); no direct V1 calls.
 * - approvalPolicy (V1 guard path) is never set in server/index.ts.
 *
 * What WAS provably dead: server/index.ts constructed a Postgres V1 store
 * and passed it to a `v2Only: true` registration that ignores it, while the
 * V1 routes actually served came from registerRoutes' own wiring. This guard
 * locks the production posture: no V1 store wired in server composition.
 */
describe('pending V1 production posture (Phase 7 guard)', () => {
  it('server composition wires no V1 pending store', () => {
    expect(serverSource).not.toContain('createPostgresPendingOperationStore');
    expect(serverSource).not.toContain('createInMemoryPendingOperationStore');
  });

  it('v2Only registration serves V2 without a V1 store and leaves V1 unmounted', async () => {
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      request.delegatedTurn = { iss: 'pi-agent', aud: 'pi-finance-api', sub: 'actor-auth', workspace: 'workspace-auth', role: 'owner', capabilities: ['financial.approval.read'], jti: 'j', request: 'r', deviceId: 'device-auth', iat: 1, exp: 301 };
      request.authenticatedContext = {
        householdId: 'workspace-auth', actorId: 'actor-auth', authUserId: 'actor-auth',
        actorType: 'user', deviceId: 'device-auth', role: 'owner',
      };
    });
    registerPendingOperationRoutes(app, {
      resolveToken: async () => ({ householdId: 'workspace-token', deviceId: 'device-token' }),
      v2Store: createInMemoryPendingOperationV2Store(),
      v2Only: true,
    });

    for (const url of ['/pending-operations?status=pending', '/pending-operations/undo']) {
      const res = await app.inject({ method: url === '/pending-operations/undo' ? 'POST' : 'GET', url, payload: {} });
      expect(res.statusCode).toBe(404);
    }
    const v2 = await app.inject({ method: 'GET', url: '/pending-operations/v2/active' });
    expect(v2.statusCode).not.toBe(404);
    await app.close();
  });
});
