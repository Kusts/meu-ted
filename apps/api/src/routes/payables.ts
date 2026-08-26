import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { DEVICE_TOKEN_HEADER } from "../auth/device-token.js";
import type { PayableStore } from "../payables/store.js";
import { DomainError } from "../writes/errors.js";
import { requireIdempotencyKey, type IdempotencyStore } from "../writes/idempotency.js";
import type { AuthResolver } from "./auth.js";

const IDEMPOTENCY_HEADER = "idempotency-key";
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const resolveAuth =
  (resolveToken: AuthResolver) => async (req: FastifyRequest) => {
    if (req.authenticatedContext) return req.authenticatedContext;
    const token = req.headers[DEVICE_TOKEN_HEADER];
    return resolveToken(Array.isArray(token) ? token[0] : token);
  };
const handleError = (err: unknown, reply: FastifyReply) => {
  if (err instanceof DomainError)
    return reply
      .code(err.statusCode)
      .send({ code: err.code, message: err.message });
  if ((err as { statusCode?: number }).statusCode) {
    const e = err as { statusCode: number; code: string; message: string };
    return reply.code(e.statusCode).send({ code: e.code, message: e.message });
  }
  throw err;
};
const querySchema = z.object({
  status: z.enum(["pending", "paid", "overdue", "cancelled"]).optional(),
  type: z.enum(["one_time", "recurring"]).optional(),
  dueWithinDays: z.coerce.number().int().min(0).max(365).optional(),
});
const autoCreateQuery = z.object({
  daysAhead: z.coerce.number().int().min(0).max(90).default(30),
});


const createSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().min(1).max(240),
  amountCents: z.number().int().positive(),
  dueDate: isoDate,
  type: z.enum(["one_time", "recurring"]).optional(),
  frequency: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  endDate: isoDate.optional(),
  reminderDaysBefore: z.number().int().min(0).max(30).optional(),
  notes: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  templateName: z.string().optional(),
});

const paySchema = z.object({
  paidDate: isoDate.optional(),
  createTransaction: z.boolean().optional(),
  prepayMonths: z.number().int().min(1).max(24).optional(),
});

const cancelSchema = z.object({ reason: z.string().optional() });

const templateSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).max(240),
  amountCents: z.number().int().positive(),
  frequency: z.enum(["monthly", "quarterly", "yearly"]),
  dayOfMonth: z.number().int().min(1).max(31),
  reminderDaysBefore: z.number().int().min(0).max(30).optional(),
  notes: z.string().optional(),
});

const fromTemplateSchema = z.object({
  templateId: z.string().uuid().optional(),
  templateName: z.string().optional(),
  dueDate: isoDate,
  amountOverrideCents: z.number().int().positive().optional(),
});

const notificationSchema = z.object({
  chatId: z.string().min(1),
  notificationType: z.enum([
    "overdue_reminder",
    "due_today_reminder",
    "upcoming_reminder",
    "daily_summary",
    "weekly_summary",
  ]),
  enabled: z.boolean(),
  scheduleHour: z.number().int().min(0).max(23).optional(),
  scheduleMinute: z.number().int().min(0).max(59).optional(),
  scheduleWindowMinutes: z.number().int().min(1).max(1440).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  thresholdDays: z.number().int().min(0).max(90).optional(),
  timezone: z.string().min(1).max(64).optional(),
});

export const payableQuerySchema = querySchema;
export const createPayableSchema = createSchema;
export const payPayableSchema = paySchema;
export const cancelPayableSchema = cancelSchema;
export const payableTemplateSchema = templateSchema;
export const payableFromTemplateSchema = fromTemplateSchema;
export { notificationSchema, autoCreateQuery };

import { createPendingApproval } from '../approvals/guard.js';
import type { ApprovalPolicy } from '../approvals/policy.js';
import type { PendingOperationStore } from '../approvals/pending.js';

export const registerPayableRoutes = (
  app: FastifyInstance,
  opts: {
    payableStore: PayableStore;
    resolveToken: AuthResolver;
    idempotency: IdempotencyStore;
    approvalPolicy?: ApprovalPolicy;
    pendingStore?: PendingOperationStore;
  },
): void => {
  const resolve = resolveAuth(opts.resolveToken);

  // GET /payables
  app.get("/payables", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const q = querySchema.safeParse(req.query);
    if (!q.success)
      return reply
        .code(400)
        .send({ code: "validation.error", issues: q.error.issues });
    try {
      const f: { status?: string; type?: string; dueWithinDays?: number } = {};
      if (q.data.status) f.status = q.data.status;
      if (q.data.type) f.type = q.data.type;
      if (q.data.dueWithinDays !== undefined)
        f.dueWithinDays = q.data.dueWithinDays;
      const items = await opts.payableStore.listPayables(ctx.householdId, f);
      return reply.code(200).send({ items, total: items.length });
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // POST /payables
  app.post("/payables", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply
        .code(400)
        .send({ code: "validation.error", issues: parsed.error.issues });
    const rawKey = req.headers[IDEMPOTENCY_HEADER] ?? req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKey !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    const fn = async () => {
      if (parsed.data.templateName) {
        const p = await opts.payableStore.createPayableWithTemplate(ctx.householdId, {
          payable: {
            accountId: parsed.data.accountId,
            description: parsed.data.description,
            amountCents: parsed.data.amountCents,
            dueDate: parsed.data.dueDate,
            ...(parsed.data.type ? { type: parsed.data.type } : {}),
            ...(parsed.data.frequency ? { frequency: parsed.data.frequency } : {}),
            ...(parsed.data.endDate ? { endDate: parsed.data.endDate } : {}),
            ...(parsed.data.reminderDaysBefore !== undefined
              ? { reminderDaysBefore: parsed.data.reminderDaysBefore }
              : {}),
            ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
            ...(parsed.data.categoryId
              ? { categoryId: parsed.data.categoryId }
              : {}),
          },
          template: {
            accountId: parsed.data.accountId,
            name: parsed.data.templateName,
            description: parsed.data.description,
            amountCents: parsed.data.amountCents,
            frequency: parsed.data.frequency ?? "monthly",
            dayOfMonth: new Date(`${parsed.data.dueDate}T00:00:00`).getUTCDate(),
            ...(parsed.data.reminderDaysBefore !== undefined
              ? { reminderDaysBefore: parsed.data.reminderDaysBefore }
              : {}),
            ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
          },
        });
        return { status: 201 as const, body: p };
      }

      const payableInput = {
        accountId: parsed.data.accountId,
        description: parsed.data.description,
        amountCents: parsed.data.amountCents,
        dueDate: parsed.data.dueDate,
        ...(parsed.data.type ? { type: parsed.data.type } : {}),
        ...(parsed.data.frequency ? { frequency: parsed.data.frequency } : {}),
        ...(parsed.data.endDate ? { endDate: parsed.data.endDate } : {}),
        ...(parsed.data.reminderDaysBefore !== undefined
          ? { reminderDaysBefore: parsed.data.reminderDaysBefore }
          : {}),
        ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
        ...(parsed.data.categoryId
          ? { categoryId: parsed.data.categoryId }
          : {}),
      };
      const p = await opts.payableStore.createPayable(ctx.householdId, payableInput);
      return { status: 201 as const, body: p };
    };

    try {
      const result = key
        ? await opts.idempotency.lookupOrRecord(
            ctx.householdId,
            key,
            parsed.data,
            fn,
          )
        : { response: await fn(), replayed: false };
      if (result.replayed) reply.header("Idempotent-Replayed", "true");
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // POST /payables/:id/pay
  app.post("/payables/:id/pay", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success)
      return reply
        .code(400)
        .send({ code: "validation.error", issues: params.error.issues });
    const parsed = paySchema.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply
        .code(400)
        .send({ code: "validation.error", issues: parsed.error.issues });
    const rawKeyPay = req.headers[IDEMPOTENCY_HEADER] ?? req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKeyPay !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    const fn = async () => {
      const p = await opts.payableStore.markPayablePaid(
        ctx.householdId,
        params.data.id,
        {
          ...(parsed.data.paidDate ? { paidDate: parsed.data.paidDate } : {}),
          ...(parsed.data.createTransaction !== undefined
            ? { createTransaction: parsed.data.createTransaction }
            : {}),
          ...(parsed.data.prepayMonths !== undefined
            ? { prepayMonths: parsed.data.prepayMonths }
            : {}),
        },
      );
      return { status: 200 as const, body: p };
    };
    try {
      const result = key
        ? await opts.idempotency.lookupOrRecord(
            ctx.householdId,
            key,
            parsed.data,
            fn,
          )
        : { response: await fn(), replayed: false };
      if (result.replayed) reply.header("Idempotent-Replayed", "true");
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // POST /payables/:id/unpay — undo payment
  app.post("/payables/:id/unpay", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success)
      return reply
        .code(400)
        .send({ code: "validation.error", issues: params.error.issues });
    try {
      const p = await opts.payableStore.undoPayablePayment(
        ctx.householdId,
        params.data.id,
      );
      return reply.code(200).send(p);
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // PATCH /payables/:id — update editable fields
  const updateSchema = z.object({
    description: z.string().trim().min(1).max(120).optional(),
    amountCents: z.number().int().positive().optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    accountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
  });

  app.patch("/payables/:id", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success)
      return reply
        .code(400)
        .send({ code: "validation.error", issues: params.error.issues });
    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply
        .code(400)
        .send({ code: "validation.error", issues: parsed.error.issues });
    const rawKey = req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKey !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    if (opts.approvalPolicy && opts.pendingStore) {
      const pending = await createPendingApproval(opts.approvalPolicy, opts.pendingStore, {
        householdId: ctx.householdId,
        requesterId: ctx.deviceId,
        operation: 'payable.update',
        payload: { id: params.data.id, ...parsed.data },
        idempotencyKey: key ?? crypto.randomUUID(),
        ...(parsed.data.amountCents !== undefined ? { amountCents: parsed.data.amountCents } : {}),
        destructive: false,
      });
      if (pending) return reply.code(pending.status).send(pending.body);
    }
    try {
      const p = await opts.payableStore.updatePayable(
        ctx.householdId,
        params.data.id,
        parsed.data,
      );
      return reply.code(200).send(p);
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // POST /payables/:id/cancel
  app.post("/payables/:id/cancel", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success)
      return reply
        .code(400)
        .send({ code: "validation.error", issues: params.error.issues });
    const parsed = cancelSchema.safeParse(req.body ?? {});
    try {
      const p = await opts.payableStore.cancelPayable(
        ctx.householdId,
        params.data.id,
        parsed.data?.reason,
      );
      return reply.code(200).send(p);
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // POST /payables/refresh-status
  app.post("/payables/refresh-status", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const rawKey = req.headers[IDEMPOTENCY_HEADER] ?? req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKey !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    const fn = async () => {
      const updated = await opts.payableStore.refreshPayableStatus(ctx.householdId);
      return { status: 200 as const, body: { updated, updatedCount: updated.length } };
    };
    try {
      const result = key
        ? await opts.idempotency.lookupOrRecord(
            ctx.householdId,
            key,
            req.query ?? {},
            fn,
          )
        : { response: await fn(), replayed: false };
      if (result.replayed) reply.header("Idempotent-Replayed", "true");
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // POST /payables/auto-create-from-templates
  app.post("/payables/auto-create-from-templates", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const parsed = autoCreateQuery.safeParse(req.query ?? {});
    if (!parsed.success)
      return reply
        .code(400)
        .send({ code: "validation.error", issues: parsed.error.issues });
    const rawKey = req.headers[IDEMPOTENCY_HEADER] ?? req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKey !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    const fn = async () => {
      const created = await opts.payableStore.autoCreateFromTemplates(
        ctx.householdId,
        parsed.data.daysAhead,
      );
      return { status: 201 as const, body: { created, createdCount: created.length } };
    };
    try {
      const result = key
        ? await opts.idempotency.lookupOrRecord(
            ctx.householdId,
            key,
            parsed.data,
            fn,
          )
        : { response: await fn(), replayed: false };
      if (result.replayed) reply.header("Idempotent-Replayed", "true");
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) {
      return handleError(e, reply);
    }
  });

  app.get("/payables/templates", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    try {
      const items = await opts.payableStore.listTemplates(ctx.householdId);
      return reply.code(200).send({ items, total: items.length });
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // POST /payables/templates
  app.post("/payables/templates", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const parsed = templateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply
        .code(400)
        .send({ code: "validation.error", issues: parsed.error.issues });
    const rawKey = req.headers[IDEMPOTENCY_HEADER] ?? req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKey !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    const fn = async () => {
      const t = await opts.payableStore.createTemplate(ctx.householdId, {
        accountId: parsed.data.accountId,
        name: parsed.data.name,
        description: parsed.data.description,
        amountCents: parsed.data.amountCents,
        frequency: parsed.data.frequency,
        dayOfMonth: parsed.data.dayOfMonth,
        ...(parsed.data.reminderDaysBefore !== undefined
          ? { reminderDaysBefore: parsed.data.reminderDaysBefore }
          : {}),
        ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
      });
      return { status: 201 as const, body: t };
    };
    try {
      const result = key
        ? await opts.idempotency.lookupOrRecord(
            ctx.householdId,
            key,
            parsed.data,
            fn,
          )
        : { response: await fn(), replayed: false };
      if (result.replayed) reply.header("Idempotent-Replayed", "true");
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // POST /payables/from-template
  app.post("/payables/from-template", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const parsed = fromTemplateSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply
        .code(400)
        .send({ code: "validation.error", issues: parsed.error.issues });
    const rawKey = req.headers[IDEMPOTENCY_HEADER] ?? req.headers['idempotency-key'] ?? req.headers['Idempotency-Key'];
    const key = rawKey !== undefined ? requireIdempotencyKey(req.headers) : undefined;
    const fn = async () => {
      const p = await opts.payableStore.createPayableFromTemplate(
        ctx.householdId,
        {
          dueDate: parsed.data.dueDate,
          ...(parsed.data.templateId
            ? { templateId: parsed.data.templateId }
            : {}),
          ...(parsed.data.templateName
            ? { templateName: parsed.data.templateName }
            : {}),
          ...(parsed.data.amountOverrideCents !== undefined
            ? { amountOverrideCents: parsed.data.amountOverrideCents }
            : {}),
        },
      );
      return { status: 201 as const, body: p };
    };
    try {
      const result = key
        ? await opts.idempotency.lookupOrRecord(
            ctx.householdId,
            key,
            parsed.data,
            fn,
          )
        : { response: await fn(), replayed: false };
      if (result.replayed) reply.header("Idempotent-Replayed", "true");
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // GET /payables/reminders
  app.get("/payables/reminders", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    try {
      const items = await opts.payableStore.listReminders(ctx.householdId);
      return reply.code(200).send({ items, total: items.length });
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // GET /notifications
  app.get("/notifications", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    try {
      const items = await opts.payableStore.listNotifications(ctx.householdId);
      return reply.code(200).send({ items, total: items.length });
    } catch (e) {
      return handleError(e, reply);
    }
  });

  // POST /notifications
  app.post("/notifications", async (req, reply) => {
    let ctx: Awaited<ReturnType<typeof resolve>>;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const parsed = notificationSchema.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply
        .code(400)
        .send({ code: "validation.error", issues: parsed.error.issues });
    try {
      const n = await opts.payableStore.configureNotification(ctx.householdId, {
        chatId: parsed.data.chatId,
        notificationType: parsed.data.notificationType,
        enabled: parsed.data.enabled,
        ...(parsed.data.scheduleHour !== undefined
          ? { scheduleHour: parsed.data.scheduleHour }
          : {}),
        ...(parsed.data.scheduleMinute !== undefined
          ? { scheduleMinute: parsed.data.scheduleMinute }
          : {}),
        ...(parsed.data.scheduleWindowMinutes !== undefined
          ? { scheduleWindowMinutes: parsed.data.scheduleWindowMinutes }
          : {}),
        ...(parsed.data.daysOfWeek
          ? { daysOfWeek: parsed.data.daysOfWeek }
          : {}),
        ...(parsed.data.thresholdDays !== undefined
          ? { thresholdDays: parsed.data.thresholdDays }
          : {}),
        ...(parsed.data.timezone ? { timezone: parsed.data.timezone } : {}),
      });
      return reply.code(201).send(n);
    } catch (e) {
      return handleError(e, reply);
    }
  });
};
