import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import type { ReadModelStore } from '../read-models/store.js';
import type { WriteStore } from '../writes/store.js';
import { createAccountInputSchema, updateAccountInputSchema } from '../writes/types.js';
import { DomainError } from '../writes/errors.js';
import { requireIdempotencyKey, type IdempotencyStore } from '../writes/idempotency.js';
import type { AuthResolver } from './auth.js';

const querySchema = z.object({ kind: z.enum(['bank', 'cash', 'credit_card']).optional() });

export const registerAccountRoutes = (
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

  app.get('/accounts', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    let accounts = await opts.store.listAccounts(ctx.householdId);
    if (parsed.data.kind) accounts = accounts.filter((a) => a.kind === parsed.data.kind);
    return reply.code(200).send({ items: accounts, total: accounts.length });
  });
  app.get('/accounts/:id', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    const account = (await opts.store.listAccounts(ctx.householdId)).find((item) => item.id === params.data.id);
    if (!account) return reply.code(404).send({ code: 'not_found', message: 'Conta não encontrada.' });
    return reply.code(200).send(account);
  });


  app.post('/accounts', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = createAccountInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
try { return reply.code(201).send(await runIdempotent(req, ctx.householdId, parsed.data, () => opts.writes.createAccount(ctx.householdId, parsed.data))); }
    catch (e) { return handleError(e, reply); }
  });

  app.patch('/accounts/:id', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    const parsed = updateAccountInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
try { return reply.code(200).send(await runIdempotent(req, ctx.householdId, { id: params.data.id, ...parsed.data }, () => opts.writes.updateAccount(ctx.householdId, params.data.id, parsed.data))); }
    catch (e) { return handleError(e, reply); }
  });

  app.post('/accounts/:id/deactivate', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
try { return reply.code(200).send(await runIdempotent(req, ctx.householdId, { id: params.data.id }, () => opts.writes.deactivateAccount(ctx.householdId, params.data.id))); }
    catch (e) { return handleError(e, reply); }
  });
};
