import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { getBetterAuthSessionContext } from '../auth/better-auth.js';
import type { BetterAuth } from '../auth/better-auth.js';
import type { WorkspaceAccessStore } from '../auth/workspace-access.js';
import { createAgentConnectionToken } from '../auth/agent-connection-token.js';
import type { AgentReplayStore } from '../auth/agent-connection-token-replay.js';
import { hashJti } from '../auth/agent-connection-token-replay-postgres.js';
import { resolveCanonicalHouseholdId } from '../auth/workspace-alias.js';

export type AgentAuthDeps = {
  auth?: BetterAuth | undefined;
  workspaceAccess?: WorkspaceAccessStore | undefined;
  connectionSecret: string;
  agentAuthServiceToken: string;
  replayStore: AgentReplayStore;
  pool?: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> } | null;
};

const verifyServiceToken = (req: FastifyRequest, serviceToken: string): boolean => {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  let bearerToken: string | undefined;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    bearerToken = authHeader.slice(7).trim();
  }
  const customHeader = req.headers['x-agent-service-token'] || req.headers['X-Agent-Service-Token'];
  const provided = (typeof customHeader === 'string' ? customHeader : Array.isArray(customHeader) ? customHeader[0] : bearerToken)?.trim();

  if (!provided || !serviceToken) {
    return false;
  }

  const expectedBuffer = Buffer.from(serviceToken, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};

export const registerAgentAuthRoutes = (app: FastifyInstance, deps: AgentAuthDeps): void => {
  // 1. Issue short-lived connection token for PWA / authenticated user
  app.post('/auth/agent-token', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!deps.auth || !deps.workspaceAccess) {
      return reply.code(503).send({ code: 'auth.auth_service_unavailable', message: 'Auth service not available' });
    }

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }

    let session: { userId: string; email: string } | undefined;
    try {
      session = await getBetterAuthSessionContext(deps.auth, headers);
    } catch {
      // Ignore session errors
    }

    if (!session) {
      return reply.code(401).send({ code: 'auth.session_required', message: 'Session required' });
    }

    const workspaceHeader = req.headers['x-workspace-id'] ?? req.headers['X-Workspace-Id'];
    const rawWs = (Array.isArray(workspaceHeader) ? workspaceHeader[0] : workspaceHeader)?.trim();
    if (!rawWs) {
      return reply.code(400).send({ code: 'auth.workspace_required', message: 'Workspace header required' });
    }
    const ws = deps.pool ? await resolveCanonicalHouseholdId(deps.pool, rawWs) : rawWs;

    const access = await deps.workspaceAccess.resolve(session.userId, ws);
    if (!access) {
      return reply.code(403).send({ code: 'auth.workspace_forbidden', message: 'Access to workspace forbidden' });
    }

    const token = await createAgentConnectionToken(
      { sub: access.userId, workspace: access.householdId, role: access.role },
      deps.connectionSecret,
    );

    return reply.send({
      token,
      expiresIn: 120,
      workspace: access.householdId,
      role: access.role,
    });
  });

  // 2. Consume token anti-replay (internal / service token protected)
  const consumeHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!verifyServiceToken(req, deps.agentAuthServiceToken)) {
      return reply.code(401).send({
        code: 'auth.invalid_service_token',
        message: 'Invalid or missing agent service authentication token',
      });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawJti = typeof body.jti === 'string' ? body.jti.trim() : undefined;
    const rawHash = typeof body.jtiHash === 'string' ? body.jtiHash.trim() : undefined;
    const jtiHash = rawHash || (rawJti ? hashJti(rawJti) : undefined);
    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : undefined;
    const actorId = typeof body.actorId === 'string' ? body.actorId.trim() : undefined;
    const connectionId = typeof body.connectionId === 'string' ? body.connectionId.trim() : undefined;
    const intentionId = typeof body.intentionId === 'string' ? body.intentionId.trim() : undefined;

    if (!jtiHash || !workspaceId || !actorId) {
      return reply.code(400).send({
        code: 'agent.invalid_parameters',
        message: 'jti (or jtiHash), workspaceId, and actorId are required',
      });
    }

    // M-09: server-side membership revalidation at consumption time (every
    // handshake AND every turn consumes). A membership revoked after the
    // token was minted is denied here — before burning the token — so
    // revocation takes effect immediately, not at token expiry.
    const canonicalWs = deps.pool ? await resolveCanonicalHouseholdId(deps.pool, workspaceId) : workspaceId;
    if (deps.workspaceAccess) {
      const access = await deps.workspaceAccess.resolve(actorId, canonicalWs);
      if (!access) {
        return reply.code(403).send({
          code: 'auth.workspace_forbidden',
          message: 'Access to workspace forbidden',
        });
      }
    }

    const expiresAt = body.expiresAt
      ? new Date(typeof body.expiresAt === 'number' ? body.expiresAt : String(body.expiresAt))
      : new Date(Date.now() + 120_000);

    const consumed = await deps.replayStore.consume({
      jtiHash,
      workspaceId,
      actorId,
      connectionId,
      intentionId,
      expiresAt,
    });

    if (!consumed) {
      return reply.code(409).send({
        ok: false,
        code: 'agent.token_replayed',
        message: 'Token has already been consumed or replayed',
      });
    }

    return reply.send({ ok: true, consumed: true });
  };

  app.post('/auth/agent-token/consume', consumeHandler);
  app.post('/internal/agent/consume-token', consumeHandler);
};
