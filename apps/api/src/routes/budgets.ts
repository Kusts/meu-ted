import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import { DomainError } from '../writes/errors.js';
import { requireIdempotencyKey, type IdempotencyStore } from '../writes/idempotency.js';
import type { BudgetStore } from '../budgets/store.js';
import type { AuthResolver } from './auth.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const createBudgetSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1),
  amountCents: z.number().int().positive(),
  period: z.enum(['monthly', 'quarterly', 'yearly']),
  startDate: isoDate,
  alertThreshold: z.number().int().min(1).max(100).optional(),
});

export const updateBudgetSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  alertThreshold: z.number().int().min(1).max(100).optional(),
});

export const budgetTrendQuerySchema = z.object({
  monthsBack: z.coerce.number().int().min(1).max(12).optional(),
});

const resolveAuth = (resolveToken: AuthResolver) => async (req: FastifyRequest) => {
  if (req.authenticatedContext) return req.authenticatedContext;
  const token = req.headers[DEVICE_TOKEN_HEADER];
  return resolveToken(Array.isArray(token) ? token[0] : token);
};
const handleError = (err: unknown, reply: FastifyReply) => {
  if (err instanceof DomainError) return reply.code(err.statusCode).send({ code: err.code, message: err.message });
  if ((err as any).statusCode) { const e = err as any; return reply.code(e.statusCode).send({ code: e.code, message: e.message }); }
  throw err;
};

import { createPendingApproval } from '../approvals/guard.js';
import type { ApprovalPolicy } from '../approvals/policy.js';
import type { PendingOperationStore } from '../approvals/pending.js';

export const registerBudgetRoutes = (
  app: FastifyInstance,
  opts: {
    budgetStore: BudgetStore;
    resolveToken: AuthResolver;
    idempotency: IdempotencyStore;
    approvalPolicy?: ApprovalPolicy;
    pendingStore?: PendingOperationStore;
  },
): void => {
  const resolve = resolveAuth(opts.resolveToken);

  app.get('/budgets', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    try {
      const items = await opts.budgetStore.listBudgets(ctx.householdId);
      return reply.code(200).send({ items, total: items.length });
    } catch (e) { return handleError(e, reply); }
  });

  app.post('/budgets', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = createBudgetSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const rawKey = req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKey !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    if (opts.approvalPolicy && opts.pendingStore) {
      const pending = await createPendingApproval(opts.approvalPolicy, opts.pendingStore, {
        householdId: ctx.householdId,
        requesterId: ctx.deviceId,
        operation: 'budget.create',
        payload: parsed.data,
        idempotencyKey: key ?? crypto.randomUUID(),
        amountCents: parsed.data.amountCents,
        destructive: false,
      });
      if (pending) return reply.code(pending.status).send(pending.body);
    }
    const fn = async () => {
      const b = await opts.budgetStore.createBudget(ctx.householdId, {
        categoryId: parsed.data.categoryId,
        name: parsed.data.name,
        amountCents: parsed.data.amountCents,
        period: parsed.data.period,
        startDate: parsed.data.startDate,
        ...(parsed.data.alertThreshold !== undefined ? { alertThreshold: parsed.data.alertThreshold } : {}),
      });
      return { status: 201 as const, body: b };
    };
    try {
      const result = key
        ? await opts.idempotency.lookupOrRecord(ctx.householdId, key, parsed.data, fn)
        : { response: await fn(), replayed: false };
      if (result.replayed) reply.header('Idempotent-Replayed', 'true');
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) { return handleError(e, reply); }
  });

  app.patch('/budgets/:id', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    const schema = z.object({ amountCents: z.number().int().positive().optional(), alertThreshold: z.number().int().min(1).max(100).optional() });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const rawKey = req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKey !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    const fn = async () => {
      const b = await opts.budgetStore.updateBudget(ctx.householdId, params.data.id, {
        ...(parsed.data.amountCents !== undefined ? { amountCents: parsed.data.amountCents } : {}),
        ...(parsed.data.alertThreshold !== undefined ? { alertThreshold: parsed.data.alertThreshold } : {}),
      });
      return { status: 200 as const, body: b };
    };
    try {
      const result = key
        ? await opts.idempotency.lookupOrRecord(ctx.householdId, key, { id: params.data.id, ...parsed.data }, fn)
        : { response: await fn(), replayed: false };
      if (result.replayed) reply.header('Idempotent-Replayed', 'true');
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) { return handleError(e, reply); }
  });


  app.get('/budgets/check', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    try {
      const items = await opts.budgetStore.listBudgets(ctx.householdId);
      return reply.code(200).send({ items: items.filter(b => b.percentUsed >= b.alertThreshold), total: 0 });
    } catch (e) { return handleError(e, reply); }
  });

  app.get('/budgets/:id/trends', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    const monthsBack = z.coerce.number().int().min(1).max(12).optional().parse(req.query ? (req.query as any).monthsBack : undefined) ?? 3;
    try {
      const items = await opts.budgetStore.getBudgetTrends(ctx.householdId, params.data.id, monthsBack);
      return reply.code(200).send({ items, total: items.length });
    } catch (e) { return handleError(e, reply); }
  });
};
