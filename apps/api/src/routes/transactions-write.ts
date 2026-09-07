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

/**
 * Origin-aware body for expense/income (item 10/B2).
 *
 * Cards and bank accounts share the same id space, but the client must name
 * the origin exactly once: `accountId` (Conta) XOR `cardId` (Cartão).
 * Both set (ambiguous origin) or neither set (missing origin) is a 422 —
 * a semantic error, not a malformed body (400).
 */
const originBodyExtension = {
  accountId: z.string().uuid().optional(),
  cardId: z.string().uuid().optional(),
};
const expenseOriginSchema = createExpenseInputSchema.extend(originBodyExtension).extend({
  accountId: z.string().uuid().optional(),
});
const incomeOriginSchema = createIncomeInputSchema.extend(originBodyExtension).extend({
  accountId: z.string().uuid().optional(),
});

type OriginResolution =
  | { ok: true; accountId: string }
  | { ok: false; code: 'validation.origin_conflict' | 'validation.origin_required'; message: string };

const resolveOrigin = (body: { accountId?: string | undefined; cardId?: string | undefined }): OriginResolution => {
  const hasAccount = body.accountId !== undefined;
  const hasCard = body.cardId !== undefined;
  if (hasAccount && hasCard) {
    return { ok: false, code: 'validation.origin_conflict', message: 'informe conta OU cartão, nunca ambos' };
  }
  if (!hasAccount && !hasCard) {
    return { ok: false, code: 'validation.origin_required', message: 'informe a conta ou o cartão de origem' };
  }
  return { ok: true, accountId: (body.accountId ?? body.cardId) as string };
};

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

  const originPostHandler = (
    path: string,
    schema: typeof expenseOriginSchema | typeof incomeOriginSchema,
    strict: typeof createExpenseInputSchema | typeof createIncomeInputSchema,
    producer: (ctx: { householdId: string }, input: { accountId: string } & Record<string, unknown>) => Promise<{ status: number; body: unknown }>,
  ) => {
    app.post(path, async (req, reply) => {
      let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
      const origin = resolveOrigin(parsed.data);
      if (!origin.ok) return reply.code(422).send({ code: origin.code, message: origin.message });
      const { cardId: _cardId, ...rest } = parsed.data;
      const normalized = strict.safeParse({ ...rest, accountId: origin.accountId });
      if (!normalized.success) return reply.code(400).send({ code: 'validation.error', issues: normalized.error.issues });
      const key = idemKey(req);
      const fn = async () => producer(ctx, normalized.data as { accountId: string } & Record<string, unknown>);
      try {
        const result = key && opts.idempotency ? await opts.idempotency.lookupOrRecord(ctx.householdId, key, normalized.data, fn) : { response: await fn(), replayed: false };
        if (result.replayed) reply.header('Idempotent-Replayed', 'true');
        return reply.code(result.response.status).send(result.response.body);
      } catch (e) { return handleError(e, reply); }
    });
  };

  originPostHandler('/transactions/expense', expenseOriginSchema, createExpenseInputSchema, async (ctx, input) => {
    const tx = await opts.writes.createExpense(ctx.householdId, input as unknown as Parameters<WriteStore['createExpense']>[1]);
    return { status: 201, body: tx };
  });

  originPostHandler('/transactions/income', incomeOriginSchema, createIncomeInputSchema, async (ctx, input) => {
    const tx = await opts.writes.createIncome(ctx.householdId, input as unknown as Parameters<WriteStore['createIncome']>[1]);
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
