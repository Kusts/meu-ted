import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import type { AuthResolver } from './auth.js';
import { DomainError, domainErrors } from '../writes/errors.js';
import type { PendingOperationExecutor, PendingOperationStore } from '../approvals/pending.js';
import type { UndoService } from '../approvals/undo.js';

export const pendingIdentitySchema = z.object({
  pendingOperationId: z.string().uuid().optional(),
  chatId: z.string().trim().min(1).max(240).optional(),
}).refine((value) => Boolean(value.pendingOperationId) !== Boolean(value.chatId), {
  message: 'pendingOperationId or chatId is required, but not both',
  path: ['pendingOperationId'],
});

export const registerPendingOperationRoutes = (app: FastifyInstance, opts: { store: PendingOperationStore; resolveToken: AuthResolver; executor?: PendingOperationExecutor; undoService?: UndoService }): void => {
  const { store, resolveToken, executor, undoService } = opts;
  const resolve = async (req: import('fastify').FastifyRequest) => {
    const token = req.headers[DEVICE_TOKEN_HEADER];
    return resolveToken(Array.isArray(token) ? token[0] : token);
  };
  const handleError = (error: unknown, reply: import('fastify').FastifyReply, forbiddenOnMissing = false) => {
    if (error instanceof DomainError) {
      if (forbiddenOnMissing && error.code === 'approval.not_found') {
        return reply.code(403).send({ code: 'approval.forbidden', message: 'Operação pendente fora do workspace do ator.' });
      }
      return reply.code(error.statusCode).send({ code: error.code, message: error.message });
    }
    throw error;
  };

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
      return reply.send(await store.approve(pendingId!, ctx.householdId, ctx.deviceId, executor));
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
      return reply.send(await store.reject(pendingId!, ctx.householdId, ctx.deviceId));
    } catch (error) { return handleError(error, reply, true); }
  });

  app.post('/pending-operations/:id/approve', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    try { return reply.send(await store.approve(params.data.id, ctx.householdId, ctx.deviceId, executor)); }
catch (error) { return handleError(error, reply, true); }
  });

  app.post('/pending-operations/:id/reject', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    try { return reply.send(await store.reject(params.data.id, ctx.householdId, ctx.deviceId)); }
catch (error) { return handleError(error, reply, true); }
  });
  app.post('/pending-operations/undo', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (error) { return handleError(error, reply); }
    try {
      if (!undoService) throw domainErrors.unsupported('undo');
      const rawKey = req.headers['idempotency-key'];
      const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : (rawKey ?? `undo:${ctx.deviceId}`);
      return reply.send(await undoService.undo(ctx.householdId, ctx.deviceId, String(idempotencyKey)));
    } catch (error) { return handleError(error, reply); }
  });
};
