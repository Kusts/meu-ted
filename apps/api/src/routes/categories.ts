import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import type { ReadModelStore } from '../read-models/store.js';
import type { WriteStore } from '../writes/store.js';
import { createCategoryInputSchema, updateCategoryInputSchema } from '../writes/types.js';
import { DomainError } from '../writes/errors.js';
import { requireIdempotencyKey, type IdempotencyStore } from '../writes/idempotency.js';
import type { AuthResolver } from './auth.js';

const querySchema = z.object({ kind: z.enum(['expense', 'income']).optional() });

export const registerCategoryRoutes = (
  app: FastifyInstance,
  opts: { store: ReadModelStore; writes: WriteStore; resolveToken: AuthResolver; idempotency?: IdempotencyStore },
): void => {
  const resolve = async (req: import('fastify').FastifyRequest) => {
    const token = req.headers[DEVICE_TOKEN_HEADER];
    return opts.resolveToken(Array.isArray(token) ? token[0] : token);
  };
  const handleError = (err: unknown, reply: import('fastify').FastifyReply) => {
    if (err instanceof DomainError) return reply.code(err.statusCode).send({ code: err.code, message: err.message });
    if ((err as { statusCode?: number }).statusCode) {
      const e = err as { statusCode: number; code: string; message: string };
      return reply.code(e.statusCode).send({ code: e.code, message: e.message });
    }
    throw err;
  };

  const runIdempotent = async <T>(req: import('fastify').FastifyRequest, householdId: string, payload: unknown, producer: () => Promise<T>): Promise<T> => {
    const key = requireIdempotencyKey(req.headers);
    if (!key || !opts.idempotency) return producer();
    return (await opts.idempotency.lookupOrRecord(householdId, key, payload, producer)).response;
  };

  app.get('/categories', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    let cats = await opts.store.listCategories(ctx.householdId);
    if (parsed.data.kind) cats = cats.filter((c) => c.kind === parsed.data.kind);
    return reply.code(200).send({ items: cats, total: cats.length });
  });

  app.post('/categories', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = createCategoryInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try { return reply.code(201).send(await runIdempotent(req, ctx.householdId, parsed.data, () => opts.writes.createCategory(ctx.householdId, parsed.data))); }
    catch (e) { return handleError(e, reply); }
  });

  app.patch('/categories/:id', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    const parsed = updateCategoryInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try { return reply.code(200).send(await runIdempotent(req, ctx.householdId, { id: params.data.id, ...parsed.data }, () => opts.writes.updateCategory(ctx.householdId, params.data.id, parsed.data))); }
    catch (e) { return handleError(e, reply); }
  });

  app.post('/categories/:id/deactivate', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    try { return reply.code(200).send(await runIdempotent(req, ctx.householdId, { id: params.data.id }, () => opts.writes.deactivateCategory(ctx.householdId, params.data.id))); }
    catch (e) { return handleError(e, reply); }
  });
};
