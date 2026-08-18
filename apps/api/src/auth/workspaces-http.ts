import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Pool } from 'pg';
import { getBetterAuthSessionContext, type createBetterAuth } from './better-auth.js';
import { withTransaction, queryInTransaction } from '../db/pool.js';
import './request-context.js';
import type { ReconnectTokenStore } from './reconnect-tokens.js';
import type { ReconnectSocketRegistry } from './reconnect-sockets.js';

type BetterAuth = ReturnType<typeof createBetterAuth>;
export type WorkspaceKind = 'personal' | 'shared';
export type WorkspaceRole = 'owner' | 'member';

export type WorkspaceSummary = {
  id: string;
  name: string;
  kind: WorkspaceKind;
  role: WorkspaceRole;
};

export type WorkspaceMember = {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
};

export type WorkspaceStore = {
  list(authUserId: string): Promise<WorkspaceSummary[]>;
  create(input: { authUserId: string; name: string; kind: WorkspaceKind }): Promise<WorkspaceSummary>;
  listMembers(input: { authUserId: string; householdId: string }): Promise<WorkspaceMember[]>;
  removeMember(input: { authUserId: string; householdId: string; memberUserId: string }): Promise<void>;
  leave(input: { authUserId: string; householdId: string }): Promise<void>;
};

export class WorkspaceError extends Error {
  constructor(
    readonly code: 'workspace.not_found' | 'workspace.forbidden' | 'workspace.personal' | 'workspace.last_owner' | 'workspace.invalid',
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

const workspaceId = z.string().uuid();
const workspaceParams = z.object({ householdId: workspaceId });
const memberParams = z.object({ householdId: workspaceId, userId: z.string().trim().min(1).max(200) });
const workspaceBody = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['personal', 'shared']).default('shared'),
});

export const registerWorkspaceRoutes = (app: FastifyInstance, opts: { auth: BetterAuth; store: WorkspaceStore; reconnectTokens?: ReconnectTokenStore; reconnectSockets?: ReconnectSocketRegistry }): void => {
  const session = async (request: FastifyRequest, reply: FastifyReply): Promise<{ userId: string; sessionId: string } | undefined> => {
    try {
      const context = await getBetterAuthSessionContext(opts.auth, new Headers(request.headers as Record<string, string>));
      if (!context) {
        await reply.code(401).send({ code: 'auth.missing_session', message: 'authenticated session required' });
        return undefined;
      }
      return { userId: context.userId, sessionId: context.sessionId };
    } catch {
      await reply.code(401).send({ code: 'auth.invalid_session', message: 'authenticated session required' });
      return undefined;
    }
  };

  app.get('/workspaces', async (request, reply) => {
    const authSession = await session(request, reply);
    if (!authSession) return;
    const items = await opts.store.list(authSession.userId);
    return reply.send({ items, total: items.length });
  });

  app.post('/workspaces', async (request, reply) => {
    const authSession = await session(request, reply);
    if (!authSession) return;
    const authUserId = authSession.userId;
    const parsed = workspaceBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      return reply.code(201).send(await opts.store.create({ authUserId, ...parsed.data }));
    } catch (error) {
      return sendWorkspaceError(reply, error);
    }
  });

  app.get('/workspaces/:householdId/members', async (request, reply) => {
    const authSession = await session(request, reply);
    if (!authSession) return;
    const authUserId = authSession.userId;
    const parsed = workspaceParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      return reply.send({ items: await opts.store.listMembers({ authUserId, householdId: parsed.data.householdId }) });
    } catch (error) {
      return sendWorkspaceError(reply, error);
    }
  });

  app.delete('/workspaces/:householdId/members/:userId', async (request, reply) => {
    const authSession = await session(request, reply);
    if (!authSession) return;
    const authUserId = authSession.userId;
    const parsed = memberParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      await opts.store.removeMember({ authUserId, householdId: parsed.data.householdId, memberUserId: parsed.data.userId });
      const removedSessions = opts.reconnectTokens?.sessionsForUser(parsed.data.userId) ?? [];
      opts.reconnectTokens?.invalidateUser(parsed.data.userId);
      opts.reconnectSockets?.closeSessions(removedSessions, 'workspace membership revoked');
      return reply.code(204).send();
    } catch (error) {
      return sendWorkspaceError(reply, error);
    }
  });

  app.post('/workspaces/:householdId/leave', async (request, reply) => {
    const authSession = await session(request, reply);
    if (!authSession) return;
    const authUserId = authSession.userId;
    const parsed = workspaceParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      await opts.store.leave({ authUserId, householdId: parsed.data.householdId });
      opts.reconnectTokens?.invalidateSession(authSession.sessionId);
      opts.reconnectTokens?.invalidateUser(authUserId);
      opts.reconnectSockets?.closeSession(authSession.sessionId, 'workspace membership revoked');
      return reply.code(204).send();
    } catch (error) {
      return sendWorkspaceError(reply, error);
    }
  });
};

const sendWorkspaceError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof WorkspaceError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  throw error;
};

type Row = Record<string, unknown>;
const toSummary = (row: Row): WorkspaceSummary => ({
  id: row['id'] as string,
  name: row['name'] as string,
  kind: row['kind'] as WorkspaceKind,
  role: row['role'] as WorkspaceRole,
});

const getUserId = async (pool: Pool, authUserId: string): Promise<string> => {
  const result = await queryInTransaction<Row>(pool, `SELECT id FROM users WHERE auth_user_id = $1 AND status = 'active'`, [authUserId]);
  const userId = result.rows[0]?.['id'];
  if (typeof userId !== 'string') throw new WorkspaceError('workspace.forbidden', 403, 'user is not active');
  return userId;
};

export const createPostgresWorkspaceStore = (pool: Pool): WorkspaceStore => ({
  async list(authUserId) {
    const result = await queryInTransaction<Row>(pool,
      `SELECT h.id, h.name, h.kind, m.role
         FROM users u JOIN memberships m ON m.user_id = u.id JOIN households h ON h.id = m.household_id
        WHERE u.auth_user_id = $1 AND u.status = 'active' AND m.status = 'active'
        ORDER BY h.kind = 'personal' DESC, h.name, h.id`,
      [authUserId],
    );
    return result.rows.map(toSummary);
  },

  async create({ authUserId, name, kind }) {
    return withTransaction(pool, async () => {
      const userId = await getUserId(pool, authUserId);
      if (kind === 'personal') {
        const existing = await queryInTransaction<Row>(pool,
          `SELECT h.id, h.name, h.kind, m.role FROM households h JOIN memberships m ON m.household_id = h.id
             WHERE h.owner_user_id = $1 AND h.kind = 'personal' AND m.user_id = $1 AND m.status = 'active'`,
          [userId],
        );
        if (existing.rows[0]) throw new WorkspaceError('workspace.invalid', 409, 'user already has a personal workspace');
      }
      const result = await queryInTransaction<Row>(pool,
        `INSERT INTO households (name, kind, owner_user_id) VALUES ($1, $2, $3) RETURNING id, name, kind`,
        [name, kind, userId],
      );
      const workspace = result.rows[0];
      if (!workspace) throw new WorkspaceError('workspace.invalid', 500, 'workspace was not created');
      return { ...toSummary({ ...workspace, role: 'owner' }) };
    });
  },

  async listMembers({ authUserId, householdId }) {
    const result = await queryInTransaction<Row>(pool,
      `SELECT u.id AS user_id, u.name, u.email, m.role
         FROM users actor JOIN memberships access ON access.user_id = actor.id
         JOIN memberships m ON m.household_id = access.household_id AND m.status = 'active'
         JOIN users u ON u.id = m.user_id
        WHERE actor.auth_user_id = $1 AND actor.status = 'active'
          AND access.household_id = $2 AND access.status = 'active'
        ORDER BY m.role DESC, u.name, u.id`,
      [authUserId, householdId],
    );
    if (!result.rows.length) throw new WorkspaceError('workspace.forbidden', 403, 'active workspace membership required');
    return result.rows.map((row) => ({ userId: row['user_id'] as string, name: row['name'] as string, email: row['email'] as string, role: row['role'] as WorkspaceRole }));
  },

  async removeMember({ authUserId, householdId, memberUserId }) {
    await withTransaction(pool, async () => {
      const actor = await getUserId(pool, authUserId);
      const result = await queryInTransaction<Row>(pool,
        `UPDATE memberships target SET status = 'removed'
            FROM households h
           WHERE target.user_id = $1 AND target.household_id = $2 AND target.status = 'active'
             AND h.id = target.household_id AND h.kind = 'shared'
             AND EXISTS (SELECT 1 FROM memberships owner WHERE owner.user_id = $3 AND owner.household_id = $2 AND owner.role = 'owner' AND owner.status = 'active')
           RETURNING target.user_id`,
        [memberUserId, householdId, actor],
      );
      if (result.rowCount !== 1) throw new WorkspaceError('workspace.forbidden', 403, 'only an owner can remove an active member');
    });
  },

  async leave({ authUserId, householdId }) {
    await withTransaction(pool, async () => {
      const actor = await getUserId(pool, authUserId);
      const result = await queryInTransaction<Row>(pool,
        `UPDATE memberships m SET status = 'removed'
            FROM households h
           WHERE m.user_id = $1 AND m.household_id = $2 AND m.status = 'active' AND h.id = m.household_id AND h.kind = 'shared'
           RETURNING m.user_id`,
        [actor, householdId],
      );
      if (result.rowCount !== 1) throw new WorkspaceError('workspace.last_owner', 409, 'you cannot leave this workspace without another active owner');
    });
  },
});
