import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import { DomainError } from '../writes/errors.js';
import type { IdempotencyStore } from '../writes/idempotency.js';
import type { PayableStore } from '../payables/store.js';
import type { AuthResolver } from './auth.js';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

const resolveAuth = (resolveToken: AuthResolver) => async (req: FastifyRequest) => {
  const token = req.headers[DEVICE_TOKEN_HEADER];
  return resolveToken(Array.isArray(token) ? token[0] : token);
};
const handleError = (err: unknown, reply: FastifyReply) => {
  if (err instanceof DomainError) return reply.code(err.statusCode).send({ code: err.code, message: err.message });
  if ((err as { statusCode?: number }).statusCode) {
    const e = err as { statusCode: number; code: string; message: string };
    return reply.code(e.statusCode).send({ code: e.code, message: e.message });
  }
  throw err;
};
const idemKey = (req: FastifyRequest): string | undefined => {
  const v = req.headers[IDEMPOTENCY_HEADER];
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (Array.isArray(v) && v[0]) return v[0].trim();
  return undefined;
};

const querySchema = z.object({
  status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).optional(),
  type: z.enum(['one_time', 'recurring']).optional(),
  dueWithinDays: z.coerce.number().int().min(0).max(365).optional(),
});

const createSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().min(1).max(240),
  amountCents: z.number().int().positive(),
  dueDate: isoDate,
  type: z.enum(['one_time', 'recurring']).optional(),
  frequency: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
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
  frequency: z.enum(['monthly', 'quarterly', 'yearly']),
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
  notificationType: z.enum(['overdue_reminder', 'due_today_reminder', 'upcoming_reminder', 'daily_summary', 'weekly_summary']),
  enabled: z.boolean(),
  scheduleHour: z.number().int().min(0).max(23).optional(),
  scheduleMinute: z.number().int().min(0).max(59).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  thresholdDays: z.number().int().min(0).max(90).optional(),
});

export const registerPayableRoutes = (
  app: FastifyInstance,
  opts: { payableStore: PayableStore; resolveToken: AuthResolver; idempotency: IdempotencyStore },
): void => {
  const resolve = resolveAuth(opts.resolveToken);

  // GET /payables
  app.get('/payables', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const q = querySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ code: 'validation.error', issues: q.error.issues });
    try {
      const f: { status?: string; type?: string; dueWithinDays?: number } = {};
      if (q.data.status) f.status = q.data.status;
      if (q.data.type) f.type = q.data.type;
      if (q.data.dueWithinDays !== undefined) f.dueWithinDays = q.data.dueWithinDays;
      const items = await opts.payableStore.listPayables(ctx.householdId, f);
      return reply.code(200).send({ items, total: items.length });
    } catch (e) { return handleError(e, reply); }
  });

  // POST /payables
  app.post('/payables', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const key = idemKey(req);
    const fn = async () => {
      const p = await opts.payableStore.createPayable(ctx.householdId, {
        accountId: parsed.data.accountId,
        description: parsed.data.description,
        amountCents: parsed.data.amountCents,
        dueDate: parsed.data.dueDate,
        ...(parsed.data.type ? { type: parsed.data.type } : {}),
        ...(parsed.data.frequency ? { frequency: parsed.data.frequency } : {}),
        ...(parsed.data.endDate ? { endDate: parsed.data.endDate } : {}),
        ...(parsed.data.reminderDaysBefore !== undefined ? { reminderDaysBefore: parsed.data.reminderDaysBefore } : {}),
        ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
        ...(parsed.data.categoryId ? { categoryId: parsed.data.categoryId } : {}),
      });
      // Optionally create template
      if (parsed.data.templateName) {
        await opts.payableStore.createTemplate(ctx.householdId, {
          accountId: parsed.data.accountId,
          name: parsed.data.templateName,
          description: parsed.data.description,
          amountCents: parsed.data.amountCents,
          frequency: parsed.data.frequency ?? 'monthly',
          dayOfMonth: new Date(parsed.data.dueDate + 'T00:00:00').getUTCDate(),
          ...(parsed.data.reminderDaysBefore !== undefined ? { reminderDaysBefore: parsed.data.reminderDaysBefore } : {}),
          ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
        });
      }
      return { status: 201 as const, body: p };
    };
    try {
      const result = key ? await opts.idempotency.lookupOrRecord(ctx.householdId, key, parsed.data, fn) : { response: await fn(), replayed: false };
      if (result.replayed) reply.header('Idempotent-Replayed', 'true');
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) { return handleError(e, reply); }
  });

  // POST /payables/:id/pay
  app.post('/payables/:id/pay', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    const parsed = paySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const key = idemKey(req);
    const fn = async () => {
      const p = await opts.payableStore.markPayablePaid(ctx.householdId, params.data.id, {
        ...(parsed.data.paidDate ? { paidDate: parsed.data.paidDate } : {}),
        ...(parsed.data.createTransaction !== undefined ? { createTransaction: parsed.data.createTransaction } : {}),
        ...(parsed.data.prepayMonths !== undefined ? { prepayMonths: parsed.data.prepayMonths } : {}),
      });
      return { status: 200 as const, body: p };
    };
    try {
      const result = key ? await opts.idempotency.lookupOrRecord(ctx.householdId, key, parsed.data, fn) : { response: await fn(), replayed: false };
      if (result.replayed) reply.header('Idempotent-Replayed', 'true');
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) { return handleError(e, reply); }
  });

  // POST /payables/:id/cancel
  app.post('/payables/:id/cancel', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ code: 'validation.error', issues: params.error.issues });
    const parsed = cancelSchema.safeParse(req.body ?? {});
    try {
      const p = await opts.payableStore.cancelPayable(ctx.householdId, params.data.id, parsed.data?.reason);
      return reply.code(200).send(p);
    } catch (e) { return handleError(e, reply); }
  });

  // GET /payables/templates
  app.get('/payables/templates', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    try {
      const items = await opts.payableStore.listTemplates(ctx.householdId);
      return reply.code(200).send({ items, total: items.length });
    } catch (e) { return handleError(e, reply); }
  });

  // POST /payables/templates
  app.post('/payables/templates', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = templateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const t = await opts.payableStore.createTemplate(ctx.householdId, {
        accountId: parsed.data.accountId,
        name: parsed.data.name,
        description: parsed.data.description,
        amountCents: parsed.data.amountCents,
        frequency: parsed.data.frequency,
        dayOfMonth: parsed.data.dayOfMonth,
        ...(parsed.data.reminderDaysBefore !== undefined ? { reminderDaysBefore: parsed.data.reminderDaysBefore } : {}),
        ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
      });
      return reply.code(201).send(t);
    } catch (e) { return handleError(e, reply); }
  });

  // POST /payables/from-template
  app.post('/payables/from-template', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = fromTemplateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const key = idemKey(req);
    const fn = async () => {
      const p = await opts.payableStore.createPayableFromTemplate(ctx.householdId, {
        dueDate: parsed.data.dueDate,
        ...(parsed.data.templateId ? { templateId: parsed.data.templateId } : {}),
        ...(parsed.data.templateName ? { templateName: parsed.data.templateName } : {}),
        ...(parsed.data.amountOverrideCents !== undefined ? { amountOverrideCents: parsed.data.amountOverrideCents } : {}),
      });
      return { status: 201 as const, body: p };
    };
    try {
      const result = key ? await opts.idempotency.lookupOrRecord(ctx.householdId, key, parsed.data, fn) : { response: await fn(), replayed: false };
      if (result.replayed) reply.header('Idempotent-Replayed', 'true');
      return reply.code(result.response.status).send(result.response.body);
    } catch (e) { return handleError(e, reply); }
  });

  // GET /payables/reminders
  app.get('/payables/reminders', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    try {
      const items = await opts.payableStore.listReminders(ctx.householdId);
      return reply.code(200).send({ items, total: items.length });
    } catch (e) { return handleError(e, reply); }
  });

  // GET /notifications
  app.get('/notifications', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    try {
      const items = await opts.payableStore.listNotifications(ctx.householdId);
      return reply.code(200).send({ items, total: items.length });
    } catch (e) { return handleError(e, reply); }
  });

  // POST /notifications
  app.post('/notifications', async (req, reply) => {
    let ctx; try { ctx = await resolve(req); } catch (e) { return handleError(e, reply); }
    const parsed = notificationSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const n = await opts.payableStore.configureNotification(ctx.householdId, {
        chatId: parsed.data.chatId,
        notificationType: parsed.data.notificationType,
        enabled: parsed.data.enabled,
        ...(parsed.data.scheduleHour !== undefined ? { scheduleHour: parsed.data.scheduleHour } : {}),
        ...(parsed.data.scheduleMinute !== undefined ? { scheduleMinute: parsed.data.scheduleMinute } : {}),
        ...(parsed.data.daysOfWeek ? { daysOfWeek: parsed.data.daysOfWeek } : {}),
        ...(parsed.data.thresholdDays !== undefined ? { thresholdDays: parsed.data.thresholdDays } : {}),
      });
      return reply.code(201).send(n);
    } catch (e) { return handleError(e, reply); }
  });
};
