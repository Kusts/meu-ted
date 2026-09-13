import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import type { AuthResolver } from './auth.js';
import { DomainError, domainErrors } from '../writes/errors.js';
import { requireIdempotencyKey } from '../writes/idempotency.js';
import { computePendingOperationV2Hash, type PendingOperationV2 } from '@pi-finance/llm-contracts';
import { PendingOperationV2Error, type PendingExecutor, type PendingOperationExecutor, type PendingOperationStore, type PendingOperationV2Store } from '../approvals/pending.js';
import type { UndoService } from '../approvals/undo.js';

export const pendingIdentitySchema = z.object({
  pendingOperationId: z.string().uuid().optional(),
  chatId: z.string().trim().min(1).max(240).optional(),
}).refine((value) => Boolean(value.pendingOperationId) !== Boolean(value.chatId), {
  message: 'pendingOperationId or chatId is required, but not both',
  path: ['pendingOperationId'],
});

export const V2_APPROVAL_CAPABILITIES = {
  propose: 'financial.approval.propose',
  read: 'financial.approval.read',
  confirm: 'financial.approval.confirm',
  execute: 'financial.approval.execute',
  retry: 'financial.approval.retry',
  cancel: 'financial.approval.cancel',
} as const;

export const registerPendingOperationRoutes = (app: FastifyInstance, opts: { store: PendingOperationStore; resolveToken: AuthResolver; executor?: PendingOperationExecutor; undoService?: UndoService; v2Store?: PendingOperationV2Store; v2Executor?: PendingExecutor; v2Only?: boolean }): void => {
  const { store, resolveToken, executor, undoService, v2Store, v2Executor } = opts;
  const resolve = async (req: import('fastify').FastifyRequest): Promise<{ householdId: string; actorId: string; deviceId: string }> => {
    if (req.authenticatedContext) return req.authenticatedContext;
    const token = req.headers[DEVICE_TOKEN_HEADER];
    const resolved = await resolveToken(Array.isArray(token) ? token[0] : token);
    return { ...resolved, actorId: resolved.deviceId };
  };
  const handleError = (error: unknown, reply: import('fastify').FastifyReply, forbiddenOnMissing = false) => {
    if (error instanceof DomainError) {
      if (forbiddenOnMissing && error.code === 'approval.not_found') {
        return reply.code(403).send({ code: 'approval.forbidden', message: 'Operação pendente fora do workspace do ator.' });
      }
      return reply.code(error.statusCode).send({ code: error.code, message: error.message });
    }
    if (error instanceof PendingOperationV2Error) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
    throw error;
  };

  // V2 authoritative proposal/confirmation surface. Identity is always taken
  // from authenticatedContext; body fields cannot select workspace/actor/device.
  if (v2Store) {
    const identity = (ctx: { householdId: string; actorId: string; deviceId: string }) => ({ workspaceId: ctx.householdId, actorId: ctx.actorId, deviceId: ctx.deviceId });
    const idSchema = z.object({ id: z.string().uuid() });
    const requireV2Capability = (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply, capability: string): boolean => {
      if (!req.delegatedTurn || !req.delegatedTurn.capabilities.includes(capability)) {
        reply.code(403).send({ code: 'auth.delegation_scope_forbidden', message: 'Capability de approval delegada obrigatória.' });
        return false;
      }
      return true;
    };
    app.post('/pending-operations/v2/propose', async (req, reply) => {
      if (!requireV2Capability(req, reply, V2_APPROVAL_CAPABILITIES.propose)) return;
      let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); }
      try {
        const key = requireIdempotencyKey(req.headers as Record<string, unknown>);
        const body = z.object({ tool: z.string().min(1), normalizedArgs: z.record(z.unknown()), expiresAt: z.string().datetime({ offset: true }).optional() }).strict().safeParse(req.body ?? {});
        if (!body.success) return reply.code(400).send({ code: 'validation.error', issues: body.error.issues });
        const base = { version: 2 as const, ...identity(ctx), tool: body.data.tool, normalizedArgs: body.data.normalizedArgs as PendingOperationV2['normalizedArgs'], proposalHash: '', idempotencyKey: key, createdAt: new Date().toISOString(), expiresAt: body.data.expiresAt ?? new Date(Date.now() + 30 * 60_000).toISOString(), bindings: identity(ctx) };
        const operation = { ...base, proposalHash: await computePendingOperationV2Hash(base) };
        return reply.code(201).send(await v2Store.propose(operation));
      } catch (error) { return handleError(error, reply); }
    });
    app.post('/pending-operations/v2', async (req, reply) => { if (!requireV2Capability(req, reply, V2_APPROVAL_CAPABILITIES.propose)) return; let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); } try { const key = requireIdempotencyKey(req.headers as Record<string, unknown>); const body = z.object({ tool: z.string().min(1), normalizedArgs: z.record(z.unknown()), expiresAt: z.string().datetime({ offset: true }).optional() }).strict().safeParse(req.body ?? {}); if (!body.success) return reply.code(400).send({ code: 'validation.error', issues: body.error.issues }); const base = { version: 2 as const, ...identity(ctx), tool: body.data.tool, normalizedArgs: body.data.normalizedArgs as PendingOperationV2['normalizedArgs'], proposalHash: '', idempotencyKey: key, createdAt: new Date().toISOString(), expiresAt: body.data.expiresAt ?? new Date(Date.now() + 30 * 60_000).toISOString(), bindings: identity(ctx) }; return reply.code(201).send(await v2Store.propose({ ...base, proposalHash: await computePendingOperationV2Hash(base) })); } catch (error) { return handleError(error, reply); } });
    const confirm = async (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => { if (!requireV2Capability(req, reply, V2_APPROVAL_CAPABILITIES.confirm)) return; let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); } const params = idSchema.safeParse(req.params); if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues }); try { return reply.send(await v2Store.confirm(params.data.id, identity(ctx))); } catch (error) { return handleError(error, reply, true); } };
    app.post('/pending-operations/v2/:id/confirm', confirm);
    app.get('/pending-operations/v2/:id', async (req, reply) => { if (!requireV2Capability(req, reply, V2_APPROVAL_CAPABILITIES.read)) return; let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); } const params = idSchema.safeParse(req.params); if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues }); try { return reply.send(await v2Store.get(params.data.id, identity(ctx))); } catch (error) { return handleError(error, reply, true); } });
    app.get('/pending-operations/v2/:id/status', async (req, reply) => { if (!requireV2Capability(req, reply, V2_APPROVAL_CAPABILITIES.read)) return; let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); } const params = idSchema.safeParse(req.params); if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues }); try { return reply.send(await v2Store.get(params.data.id, identity(ctx))); } catch (error) { return handleError(error, reply, true); } });
    const reject = async (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => { if (!requireV2Capability(req, reply, V2_APPROVAL_CAPABILITIES.cancel)) return; let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); } const params = idSchema.safeParse(req.params); if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues }); try { return reply.send(await v2Store.cancel(params.data.id, identity(ctx))); } catch (error) { return handleError(error, reply, true); } };
    app.post('/pending-operations/v2/:id/reject', reject);
    app.post('/pending-operations/v2/:id/cancel', reject);
    app.post('/pending-operations/v2/:id/execute', async (req, reply) => { if (!requireV2Capability(req, reply, V2_APPROVAL_CAPABILITIES.execute)) return; let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); } const params = idSchema.safeParse(req.params); if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues }); const body = z.object({ attestation: z.string().min(32) }).strict().safeParse(req.body ?? {}); if (!body.success) return reply.code(400).send({ code: 'validation.error', issues: body.error.issues }); if (!v2Executor) return reply.code(501).send({ code: 'unsupported', message: 'Executor V2 não configurado.' }); try { return reply.send(await v2Store.execute(body.data.attestation, identity(ctx), v2Executor)); } catch (error) { return handleError(error, reply, true); } });
    app.post('/pending-operations/v2/:id/retry', async (req, reply) => { if (!requireV2Capability(req, reply, V2_APPROVAL_CAPABILITIES.retry)) return; let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); } const params = idSchema.safeParse(req.params); if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues }); try { return reply.send(await v2Store.retry(params.data.id, identity(ctx))); } catch (error) { return handleError(error, reply, true); } });
    app.post('/pending-operations/v2/:id/expire', async (req, reply) => { if (!requireV2Capability(req, reply, V2_APPROVAL_CAPABILITIES.cancel)) return; let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); } const params = idSchema.safeParse(req.params); if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues }); try { return reply.send(await v2Store.expire(params.data.id, identity(ctx))); } catch (error) { return handleError(error, reply, true); } });
  }

  if (opts.v2Only) return;

  app.get('/pending-operations/details', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); }
    const query = pendingIdentitySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ code: 'validation.error', issues: query.error.issues });

    try {
      if (query.data.chatId !== undefined) {
        if (req.contextClaims?.chatId !== query.data.chatId) {
          return reply.code(403).send({ code: 'auth.context_chat_mismatch', message: 'chatId does not match the authenticated bridge context' });
        }
        return reply.send({ operation: await store.findByChatId(query.data.chatId, ctx.householdId) ?? null });
      }
      return reply.send({ operation: await store.get(query.data.pendingOperationId!, ctx.householdId) });
    } catch (error) { return handleError(error, reply); }
  });

  app.get('/pending-operations', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); }
    const query = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'expired']).optional() }).safeParse(req.query);
    if (!query.success) return reply.code(400).send({ code: 'validation.error', issues: query.error.issues });
    try {
      const items = await store.list(ctx.householdId, query.data.status);
      return reply.send({ items, total: items.length });
    } catch (error) { return handleError(error, reply); }
  });

  app.get('/pending-operations/:id', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    try { return reply.send(await store.get(params.data.id, ctx.householdId)); }
    catch (error) { return handleError(error, reply); }
  });

  app.post('/pending-operations/approve', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); }
    const query = pendingIdentitySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ code: 'validation.error', issues: query.error.issues });
    try {
      let pendingId = query.data.pendingOperationId;
      if (query.data.chatId !== undefined) {
        if (req.contextClaims?.chatId !== query.data.chatId) {
          return reply.code(403).send({ code: 'auth.context_chat_mismatch', message: 'chatId does not match the authenticated bridge context' });
        }
        const pending = await store.findByChatId(query.data.chatId, ctx.householdId);
        if (!pending) throw domainErrors.approvalNotFound();
        pendingId = pending.id;
      }
      return reply.send(await store.approve(pendingId!, ctx.householdId, ctx.actorId, executor));
    } catch (error) { return handleError(error, reply, true); }
  });

  app.post('/pending-operations/reject', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); }
    const query = pendingIdentitySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ code: 'validation.error', issues: query.error.issues });
    try {
      let pendingId = query.data.pendingOperationId;
      if (query.data.chatId !== undefined) {
        if (req.contextClaims?.chatId !== query.data.chatId) {
          return reply.code(403).send({ code: 'auth.context_chat_mismatch', message: 'chatId does not match the authenticated bridge context' });
        }
        const pending = await store.findByChatId(query.data.chatId, ctx.householdId);
        if (!pending) throw domainErrors.approvalNotFound();
        pendingId = pending.id;
      }
      return reply.send(await store.reject(pendingId!, ctx.householdId, ctx.actorId));
    } catch (error) { return handleError(error, reply, true); }
  });

  app.post('/pending-operations/:id/approve', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    try { return reply.send(await store.approve(params.data.id, ctx.householdId, ctx.actorId, executor)); }
catch (error) { return handleError(error, reply, true); }
  });

  app.post('/pending-operations/:id/reject', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    try { return reply.send(await store.reject(params.data.id, ctx.householdId, ctx.actorId)); }
catch (error) { return handleError(error, reply, true); }
  });
  app.post('/pending-operations/undo', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); }
    try {
      if (!undoService) throw domainErrors.unsupported('undo');
      const idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
      const bodySchema = z.object({ lastOperationId: z.string().uuid().optional() });
      const parsed = bodySchema.safeParse((req.body as unknown) ?? {});
      if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
      const result = await undoService.undo(ctx.householdId, ctx.actorId, idempotencyKey, parsed.data.lastOperationId);
      return reply.code(200).send(result);
    } catch (error) { return handleError(error, reply); }
  });
};
