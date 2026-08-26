import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import type { ReadModelStore } from '../read-models/store.js';
import type { WriteStore } from '../writes/store.js';
import type { IdempotencyStore } from '../writes/idempotency.js';
import { createExpenseInputSchema, createIncomeInputSchema, createTransferInputSchema, updateTransactionInputSchema } from '../writes/types.js';
import { DomainError } from '../writes/errors.js';
import { requireIdempotencyKey } from '../writes/idempotency.js';
import type { AuthResolver } from './auth.js';

const IDEMPOTENCY_HEADER = 'idempotency-key';

export const registerTransactionWriteRoutes = (
  app: FastifyInstance,
  opts: { store: ReadModelStore; writes: WriteStore; resolveToken: AuthResolver; idempotency: IdempotencyStore },
): void => {
  const resolve = async (req: import('fastify').FastifyRequest) => {
    if (req.authenticatedContext) return req.authenticatedContext;
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
    const raw = req.headers[IDEMPOTENCY_HEADER] ?? req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    if (raw === undefined) return producer();
    const key = requireIdempotencyKey(req.headers);
    if (!opts.idempotency) return producer();
    return (await opts.idempotency.lookupOrRecord(householdId, key, payload, producer)).response;
  };
  const idemKey = (req: import('fastify').FastifyRequest): string | undefined => {
    const raw = req.headers[IDEMPOTENCY_HEADER] ?? req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    if (raw === undefined) return undefined;
    return requireIdempotencyKey(req.headers);
  };

  const postHandler = (path: string, schema: z.ZodTypeAny, producer: (ctx: { householdId: string }, input: any) => Promise<{ status: number; body: unknown }>) => {
    app.post(path, async (req, reply) => {
      let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
      const key = idemKey(req);
      const fn = async () => producer(ctx, parsed.data);
      try {
        const result = key && opts.idempotency ? await opts.idempotency.lookupOrRecord(ctx.householdId, key, parsed.data, fn) : { response: await fn(), replayed: false };
        if (result.replayed) reply.header('Idempotent-Replayed', 'true');
        return reply.code(result.response.status).send(result.response.body);
      } catch (e) { return handleError(e, reply); }
    });
  };

  postHandler('/transactions/expense', createExpenseInputSchema, async (ctx, input) => {
    const tx = await opts.writes.createExpense(ctx.householdId, input);
    return { status: 201, body: tx };
  });

  postHandler('/transactions/income', createIncomeInputSchema, async (ctx, input) => {
    const tx = await opts.writes.createIncome(ctx.householdId, input);
    return { status: 201, body: tx };
  });

  postHandler('/transfers', createTransferInputSchema, async (ctx, input) => {
    const tx = await opts.writes.createTransfer(ctx.householdId, input);
    return { status: 201, body: tx };
  });

  app.patch('/transactions/:id', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    const parsed = updateTransactionInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try { return reply.code(200).send(await runIdempotent(req, ctx.householdId, { id: params.data.id, ...parsed.data }, () => opts.writes.updateTransaction(ctx.householdId, params.data.id, parsed.data))); }
    catch (e) { return handleError(e, reply); }
  });

  app.delete('/transactions/:id', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    try { await runIdempotent(req, ctx.householdId, { id: params.data.id }, () => opts.writes.softDeleteTransaction(ctx.householdId, params.data.id)); return reply.code(204).send(); }
    catch (e) { return handleError(e, reply); }
  });
};
