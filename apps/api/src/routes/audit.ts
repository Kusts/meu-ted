import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuthenticatedRequest, type AuthenticatedContext } from '../auth/request-context.js';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import type { AuditLogFilters, AuditLogStore } from '../audit/store.js';
import type { AuthResolver } from './auth.js';
import { DomainError } from '../writes/errors.js';
import { requireIdempotencyKey } from '../writes/idempotency.js';
import type { UndoService } from '../approvals/undo.js';

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  operation: z.string().min(1).optional(),
  eventType: z.string().min(1).optional(),
  actorType: z.enum(['device', 'user']).optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().uuid().optional(),
});

const resolveAuth = async (
  request: FastifyRequest,
  resolveToken?: AuthResolver,
): Promise<AuthenticatedContext> => {
  if (request.authenticatedContext) return request.authenticatedContext;
  if (resolveToken) {
    const header = request.headers[DEVICE_TOKEN_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    const context = await resolveToken(token);
    return {
      householdId: context.householdId,
      actorId: context.deviceId,
      actorType: 'device',
      deviceId: context.deviceId,
    };
  }
  return requireAuthenticatedRequest(request).authenticatedContext;
};

export const undoBodySchema = z.object({
  lastOperationId: z.string().uuid().optional(),
});

export const registerAuditRoutes = (app: FastifyInstance, opts: { auditLogs: AuditLogStore; resolveToken?: AuthResolver; undoService?: UndoService }): void => {
  app.post('/audit/undo', async (req, reply) => {
    let ctx: AuthenticatedContext;
    try {
      ctx = await resolveAuth(req, opts.resolveToken);
    } catch (e: any) {
      return reply.code(e.statusCode ?? 401).send({ code: e.code ?? 'auth.error', message: e.message ?? 'unauthorized' });
    }
    let idempotencyKey: string;
    try {
      idempotencyKey = requireIdempotencyKey(req.headers as Record<string, unknown>);
    } catch (e: any) {
      if (e instanceof DomainError) return reply.code(e.statusCode).send({ code: e.code, message: e.message });
      throw e;
    }
    if (!opts.undoService) {
      return reply.code(400).send({ code: 'unsupported', message: 'Operação não suportada: undo.' });
    }
    const parsed = undoBodySchema.safeParse((req.body as unknown) ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const result = await opts.undoService.undo(ctx.householdId, ctx.actorId, idempotencyKey, parsed.data.lastOperationId);
      return reply.code(200).send(result);
    } catch (e: any) {
      if (e instanceof DomainError) return reply.code(e.statusCode).send({ code: e.code, message: e.message });
      throw e;
    }
  });

  app.get('/audit-logs', async (req, reply) => {
    let ctx: AuthenticatedContext;
    try {
      ctx = await resolveAuth(req, opts.resolveToken);
    } catch (e: any) {
      return reply.code(e.statusCode ?? 401).send({ code: e.code ?? 'auth.error', message: e.message ?? 'unauthorized' });
    }
    const parsed = auditQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const filters: AuditLogFilters = { limit: parsed.data.limit };
    if (parsed.data.operation !== undefined) filters.operation = parsed.data.operation;
    if (parsed.data.eventType !== undefined) filters.eventType = parsed.data.eventType;
    if (parsed.data.actorType !== undefined) filters.actorType = parsed.data.actorType;
    if (parsed.data.entityType !== undefined) filters.entityType = parsed.data.entityType;
    if (parsed.data.entityId !== undefined) filters.entityId = parsed.data.entityId;
    const result = await opts.auditLogs.listAuditLogs(ctx.householdId, filters);
    return reply.code(200).send(result);
  });
};
