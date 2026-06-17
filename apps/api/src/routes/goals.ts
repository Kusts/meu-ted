import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import { DomainError } from '../writes/errors.js';
import type { IdempotencyStore } from '../writes/idempotency.js';
import type { GoalStore } from '../goals/store.js';
import type { AuthResolver } from './auth.js';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const resolveAuth = (rt: AuthResolver) => async (req: FastifyRequest) => { const t = req.headers[DEVICE_TOKEN_HEADER]; return rt(Array.isArray(t) ? t[0] : t); };
const handleErr = (err: unknown, reply: FastifyReply) => {
  if (err instanceof DomainError) return reply.code(err.statusCode).send({ code: err.code, message: err.message });
  if ((err as any).statusCode) { const e = err as any; return reply.code(e.statusCode).send({ code: e.code, message: e.message }); }
  throw err;
};
const idemKey = (req: FastifyRequest) => { const v = req.headers[IDEMPOTENCY_HEADER]; if (typeof v === 'string' && v.trim()) return v.trim(); if (Array.isArray(v) && v[0]) return v[0].trim(); return undefined; };

export const registerGoalRoutes = (app: FastifyInstance, opts: { goalStore: GoalStore; resolveToken: AuthResolver; idempotency: IdempotencyStore }): void => {
  const resolve = resolveAuth(opts.resolveToken);

  app.get('/goals', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleErr(e, reply); }
    try { const items = await opts.goalStore.listGoals(ctx.householdId); return reply.send({ items, total: items.length }); }
    catch (e) { return handleErr(e, reply); }
  });

  app.post('/goals', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleErr(e, reply); }
    const s = z.object({ name: z.string().trim().min(1), goalType: z.enum(['savings','purchase','debt_payoff','emergency_fund']), targetAmountCents: z.number().int().positive(), startDate: isoDate, targetDate: isoDate.optional(), description: z.string().optional(), categoryId: z.string().uuid().optional(), accountId: z.string().uuid().optional(), notes: z.string().optional() });
    const p = s.safeParse(req.body ?? {}); if (!p.success) return reply.code(400).send({ code: 'validation.error', issues: p.error.issues });
    try { const g = await opts.goalStore.createGoal(ctx.householdId, {
      name: p.data.name, goalType: p.data.goalType, targetAmountCents: p.data.targetAmountCents, startDate: p.data.startDate,
      ...(p.data.targetDate ? { targetDate: p.data.targetDate } : {}),
      ...(p.data.description ? { description: p.data.description } : {}),
      ...(p.data.categoryId ? { categoryId: p.data.categoryId } : {}),
      ...(p.data.accountId ? { accountId: p.data.accountId } : {}),
      ...(p.data.notes ? { notes: p.data.notes } : {}),
    }); return reply.code(201).send(g); }
    catch (e) { return handleErr(e, reply); }
  });

  app.post('/goals/:id/contribute', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleErr(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params); if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    const s = z.object({ amountCents: z.number().int().positive(), contributionDate: isoDate.optional(), source: z.string().optional(), notes: z.string().optional() });
    const p = s.safeParse(req.body ?? {}); if (!p.success) return reply.code(400).send({ code: 'validation.error', issues: p.error.issues });
    try { const c = await opts.goalStore.contributeToGoal(ctx.householdId, params.data.id, {
      amountCents: p.data.amountCents,
      ...(p.data.contributionDate ? { contributionDate: p.data.contributionDate } : {}),
      ...(p.data.source ? { source: p.data.source } : {}),
      ...(p.data.notes ? { notes: p.data.notes } : {}),
    }); return reply.code(201).send(c); }
    catch (e) { return handleErr(e, reply); }
  });

  app.post('/goals/:id/cancel', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleErr(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params); if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    try { const g = await opts.goalStore.cancelGoal(ctx.householdId, params.data.id); return reply.send(g); }
    catch (e) { return handleErr(e, reply); }
  });
};
