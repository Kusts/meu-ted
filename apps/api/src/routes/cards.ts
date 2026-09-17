/**
 * Card routes — credit card read/write endpoints for the PWA.
 *
 * Registered under /cards/*. Requires X-Device-Token header.
 * Idempotency-key supported for POST endpoints.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import { DomainError } from '../writes/errors.js';
import { requireIdempotencyKey, type IdempotencyStore } from '../writes/idempotency.js';
import type { CardStore } from '../cards/store.js';
import type { AuthResolver } from './auth.js';
import { attachMutationReceipt } from '../reconciliation/effects-registry.js';

// ── Input schemas ────────────────────────────────────────────────


const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

// M-04: card purchases/installments preserve the same metadata as plain
// entries (subcategory + notes), applied to every parcel.
const cardMetadataExtension = {
  subcategoryId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
};

const purchaseSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().min(1).max(240),
  amountCents: z.number().int().positive(),
  date: isoDate,
  categoryId: z.string().uuid().optional(),
  ...cardMetadataExtension,
  installmentsTotal: z.number().int().min(1).max(48).optional(),
  installmentNumber: z.number().int().min(1).max(48).optional(),
});

const installmentsSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().min(1).max(240),
  totalAmountCents: z.number().int().min(100),
  purchaseDate: isoDate,
  installmentsTotal: z.number().int().min(1).max(48),
  categoryId: z.string().uuid().optional(),
  ...cardMetadataExtension,
});

const recurringSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().min(1).max(240),
  amountCents: z.number().int().positive(),
  frequency: z.enum(['monthly', 'quarterly', 'yearly']),
  startDate: isoDate,
  endDate: isoDate.optional(),
  categoryId: z.string().uuid().optional(),
});

const recurringQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
  status: z.enum(['active', 'paused', 'cancelled']).optional(),
});

const paySchema = z.object({
  amountCents: z.number().int().positive(),
  fromAccountId: z.string().uuid(),
});

const createCardSchema = z.object({
  name: z.string().trim().min(1).max(120),
  creditLimitCents: z.number().int().positive(),
  closingDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
});

const updateCardSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  creditLimitCents: z.number().int().positive().optional(),
  closingDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
}).refine((v) => v.name !== undefined || v.creditLimitCents !== undefined || v.closingDay !== undefined || v.dueDay !== undefined, { message: 'nenhum campo para atualizar' });

const querySchema = z.object({
  accountId: z.string().uuid().optional(),
  status: z.enum(['open', 'closed', 'paid', 'partial', 'overdue', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const cardPurchaseSchema = purchaseSchema;
export const cardInstallmentsSchema = installmentsSchema;
export const cardRecurringSchema = recurringSchema;
export const cardPaySchema = paySchema;
export const cardStatementQuerySchema = querySchema;
export { createCardSchema, updateCardSchema, recurringQuerySchema };

// ── Helpers ──────────────────────────────────────────────────────

const resolveAuth = (resolveToken: AuthResolver) => async (req: FastifyRequest) => {
  if (req.authenticatedContext) return req.authenticatedContext;
  const token = req.headers[DEVICE_TOKEN_HEADER];
  return resolveToken(Array.isArray(token) ? token[0] : token);
};

const handleError = (err: unknown, reply: FastifyReply) => {
  if (err instanceof DomainError) {
    return reply.code(err.statusCode).send({ code: err.code, message: err.message });
  }
  if ((err as { statusCode?: number }).statusCode) {
    const e = err as { statusCode: number; code: string; message: string };
    return reply.code(e.statusCode).send({ code: e.code, message: e.message });
  }
  throw err;
};

// ── Registration ─────────────────────────────────────────────────


import { createPendingApproval } from '../approvals/guard.js';
import type { ApprovalPolicy } from '../approvals/policy.js';
import type { PendingOperationStore } from '../approvals/pending.js';
import { runCardMutation } from '../cards/keyed-mutations.js';

export const registerCardRoutes = (
  app: FastifyInstance,
  opts: {
    cardStore: CardStore;
    resolveToken: AuthResolver;
    idempotency: IdempotencyStore;
    approvalPolicy?: ApprovalPolicy;
    pendingStore?: PendingOperationStore;
  },
): void => {
  const resolve = resolveAuth(opts.resolveToken);

  // GET /cards/accounts — list credit card accounts
  app.get('/cards/accounts', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    try {
      const accounts = await opts.cardStore.listCreditCardAccounts(ctx.householdId);
      return reply.code(200).send({ items: accounts, total: accounts.length });
    } catch (e) { return handleError(e, reply); }
  });

  // GET /cards/statements — list statements
  app.get('/cards/statements', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const q = querySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ code: 'validation.error', issues: q.error.issues });
    try {
      const f: { status?: string; limit?: number } = {};
      if (q.data.status) f.status = q.data.status;
      if (q.data.limit !== undefined) f.limit = q.data.limit;
      const statements = await opts.cardStore.listStatements(ctx.householdId, q.data.accountId, f);
      return reply.code(200).send({ items: statements, total: statements.length });
    } catch (e) { return handleError(e, reply); }
  });

  // GET /cards/statements/:id — statement detail with purchases
  app.get('/cards/statements/:id', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    try {
      const detail = await opts.cardStore.getStatementDetail(ctx.householdId, params.data.id);
      if (!detail) return reply.code(404).send({ code: 'not_found', message: 'Fatura não encontrada.' });
      return reply.code(200).send(detail);
    } catch (e) { return handleError(e, reply); }
  });

  // POST /cards/purchases — create card purchase
  app.post('/cards/purchases', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = purchaseSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const rawKey = req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKey !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    if (opts.approvalPolicy && opts.pendingStore) {
      const pending = await createPendingApproval(opts.approvalPolicy, opts.pendingStore, {
        householdId: ctx.householdId,
        requesterId: ctx.deviceId,
        operation: 'card.create_purchase',
        payload: parsed.data,
        idempotencyKey: key ?? crypto.randomUUID(),
        amountCents: parsed.data.amountCents,
        destructive: false,
      });
      if (pending) return reply.code(pending.status).send(pending.body);
    }
    const fn = async (claimTx?: unknown) => {
      // V4.1 Phase 3 (UOW2): purchase + statement link + total recompute
      // join the idempotency claim tx.
      const txs = await runCardMutation(opts.cardStore, claimTx, ctx.householdId, 'purchase', {
        accountId: parsed.data.accountId,
        description: parsed.data.description,
        amountCents: parsed.data.amountCents,
        date: parsed.data.date,
        ...(parsed.data.categoryId ? { categoryId: parsed.data.categoryId } : {}),
        ...(parsed.data.subcategoryId ? { subcategoryId: parsed.data.subcategoryId } : {}),
        ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
        ...(parsed.data.installmentsTotal != null ? { installmentsTotal: parsed.data.installmentsTotal } : {}),
        ...(parsed.data.installmentNumber != null ? { installmentNumber: parsed.data.installmentNumber } : {}),
      });
      // T3.2 (SPEC §15.1): receipt built inside the idempotent producer so
      // keyed replays preserve the mutationId. A card purchase creates
      // transactions (statement linkage is a consequence) → transaction.create.
      const first = txs[0];
      return {
        status: 201 as const,
        body: attachMutationReceipt({ items: txs }, 'transaction.create', first ? { type: 'transaction', id: first.id } : undefined),
      };
    };
    try {
      const result = key ? await opts.idempotency.lookupOrRecord(ctx.householdId, key, parsed.data, fn) : { response: await fn(), replayed: false };
      if (result.replayed) reply.header('Idempotent-Replayed', 'true');
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) { return handleError(e, reply); }
  });

  // POST /cards/installments — create installment purchases
  app.post('/cards/installments', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = installmentsSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const rawKey = req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKey !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    const fn = async (claimTx?: unknown) => {
      const txs = await runCardMutation(opts.cardStore, claimTx, ctx.householdId, 'installments', {
        accountId: parsed.data.accountId,
        description: parsed.data.description,
        totalAmountCents: parsed.data.totalAmountCents,
        purchaseDate: parsed.data.purchaseDate,
        installmentsTotal: parsed.data.installmentsTotal,
        ...(parsed.data.categoryId ? { categoryId: parsed.data.categoryId } : {}),
        ...(parsed.data.subcategoryId ? { subcategoryId: parsed.data.subcategoryId } : {}),
        ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
      });
      // T3.2 (SPEC §15.1): same receipt contract as single purchases —
      // installments create N transactions → transaction.create.
      const first = txs[0];
      return {
        status: 201 as const,
        body: attachMutationReceipt({ items: txs }, 'transaction.create', first ? { type: 'transaction', id: first.id } : undefined),
      };
    };
    try {
      const result = key ? await opts.idempotency.lookupOrRecord(ctx.householdId, key, parsed.data, fn) : { response: await fn(), replayed: false };
      if (result.replayed) reply.header('Idempotent-Replayed', 'true');
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) { return handleError(e, reply); }
  });

  // GET /cards/recurring — list recurring purchases
  app.get('/cards/recurring', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = recurringQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const filters = {
        ...(parsed.data.accountId ? { accountId: parsed.data.accountId } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      };
      const items = await opts.cardStore.listRecurringPurchases(ctx.householdId, filters);
      return reply.code(200).send({ items, total: items.length });
    } catch (e) { return handleError(e, reply); }
  });

  // POST /cards/recurring — create recurring purchase on a credit card
  app.post('/cards/recurring', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = recurringSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const rawKey = req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKey !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    const fn = async (claimTx?: unknown) => {
      const r = await runCardMutation(opts.cardStore, claimTx, ctx.householdId, 'recurring', {
        accountId: parsed.data.accountId,
        description: parsed.data.description,
        amountCents: parsed.data.amountCents,
        frequency: parsed.data.frequency,
        startDate: parsed.data.startDate,
        ...(parsed.data.endDate ? { endDate: parsed.data.endDate } : {}),
        ...(parsed.data.categoryId ? { categoryId: parsed.data.categoryId } : {}),
      });
      // T3.2 (SPEC §15.1): a recurring template feeds future statements
      // (no transaction yet) → statement.create.
      return { status: 201 as const, body: attachMutationReceipt(r, 'statement.create', { type: 'recurring-purchase', id: r.id }) };
    };
    try {
      const result = key ? await opts.idempotency.lookupOrRecord(ctx.householdId, key, parsed.data, fn) : { response: await fn(), replayed: false };
      if (result.replayed) reply.header('Idempotent-Replayed', 'true');
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) { return handleError(e, reply); }
  });

  // POST /cards/statements/:id/pay — pay statement
  app.post('/cards/statements/:id/pay', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    const parsed = paySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const rawKey = req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKey !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    const fn = async (claimTx?: unknown) => {
      // V4.1 Phase 3 (UOW2): lock → remaining → payment → paid/status join
      // the idempotency claim tx.
      const s = await runCardMutation(opts.cardStore, claimTx, ctx.householdId, 'payStatement', {
        statementId: params.data.id,
        input: parsed.data,
      });
      return { status: 200 as const, body: attachMutationReceipt(s, 'statement.update', { type: 'statement', id: params.data.id }) };
    };
    try {
      const result = key ? await opts.idempotency.lookupOrRecord(ctx.householdId, key, parsed.data, fn) : { response: await fn(), replayed: false };
      if (result.replayed) reply.header('Idempotent-Replayed', 'true');
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) { return handleError(e, reply); }
  });

  // POST /cards — create a credit card account
  app.post('/cards', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = createCardSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const card = await opts.cardStore.createCard(ctx.householdId, parsed.data);
      // T3.2 (SPEC §15.1): a credit card is an account → account.create.
      return reply.code(201).send(attachMutationReceipt(card, 'account.create', { type: 'account', id: card.id }));
    } catch (e) { return handleError(e, reply); }
  });

  // PATCH /cards/:id — update a credit card account
  app.patch('/cards/:id', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    const parsed = updateCardSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const card = await opts.cardStore.updateCard(ctx.householdId, params.data.id, parsed.data as Parameters<typeof opts.cardStore.updateCard>[2]);
      // T3.2 (SPEC §15.1): same account domain → account.update.
      return reply.code(200).send(attachMutationReceipt(card, 'account.update', { type: 'account', id: params.data.id }));
    } catch (e) { return handleError(e, reply); }
  });

  // PATCH /cards/purchases/:id — update a purchase on a statement
  app.patch('/cards/purchases/:id', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    const purchaseSchema = z.object({
      description: z.string().trim().min(1).max(240).optional(),
      amountCents: z.number().int().positive().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
      categoryId: z.string().uuid().optional(),
    }).refine((v) => v.description !== undefined || v.amountCents !== undefined || v.date !== undefined || v.categoryId !== undefined, { message: 'nenhum campo para atualizar' });
    const parsed = purchaseSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const detail = await opts.cardStore.updatePurchase(ctx.householdId, params.data.id, parsed.data as Parameters<typeof opts.cardStore.updatePurchase>[2]);
      // T3.2 (SPEC §15.1): a purchase edit mutates its transaction →
      // transaction.update (additive: statement detail fields untouched).
      return reply.code(200).send(attachMutationReceipt(detail, 'transaction.update', { type: 'transaction', id: params.data.id }));
    } catch (e) { return handleError(e, reply); }
  });

  // DELETE /cards/purchases/:id — cancel a purchase on an open statement (auditável)
  app.delete('/cards/purchases/:id', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    const rawKey = req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKey !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    // T3.2 (SPEC §15.1): 200 with a transaction.delete receipt — 204 cannot
    // carry a body. Cancelling removes a financial effect, so a receipt is
    // required. Receipt built inside the idempotent producer so keyed
    // replays preserve the mutationId (cancel itself stays idempotent).
    const fn = async (claimTx?: unknown) => {
      // V4.1 Phase 3 (UOW2): the cancel effect joins the claim tx.
      await runCardMutation(opts.cardStore, claimTx, ctx.householdId, 'cancelPurchase', { purchaseId: params.data.id });
      return {
        status: 200 as const,
        body: attachMutationReceipt(
          { id: params.data.id, cancelled: true },
          'transaction.delete',
          { type: 'transaction', id: params.data.id },
        ),
      };
    };
    try {
      const result = key ? await opts.idempotency.lookupOrRecord(ctx.householdId, key, { id: params.data.id }, fn) : { response: await fn(), replayed: false };
      if (result.replayed) reply.header('Idempotent-Replayed', 'true');
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) { return handleError(e, reply); }
  });
};
