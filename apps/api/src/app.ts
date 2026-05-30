// ─────────────────────────────────────────────────────────────────────────────
// Fastify API - Main Application
// ─────────────────────────────────────────────────────────────────────────────

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  FinancialRecordService,
  CategoryService,
  CardInvoiceService,
  RecurrenceService,
  ReviewService,
} from '@pi-financeiro/domain';
import type { Account, AccountType, AccountScope, CategoryKind } from '@pi-financeiro/domain';
import type { CreditCard } from '@pi-financeiro/domain';
import { createApiDependencies, type ApiDependencies } from './deps.js';

// ─────────────────────────────────────────────────────────────────────────────
// App Options
// ─────────────────────────────────────────────────────────────────────────────

export interface AppOptions {
  webhookSecret?: string;
  allowedGroupIds?: string[];
  registeredPhones?: string[];
  deps?: ApiDependencies;
  reviewService?: ReviewService;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create App
// ─────────────────────────────────────────────────────────────────────────────

export function createApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  // Use provided dependencies or create in-memory ones
  const deps = options.deps ?? createApiDependencies({ mode: 'memory' });

  const {
    accountRepository,
    categoryRepository,
    financialRecordRepository,
    ledgerRepository,
    auditLogRepository,
    idempotencyRepository,
    creditCardRepository,
    invoiceRepository,
    installmentGroupRepository,
    recurrenceRepository,
    recurrenceOccurrenceRepository,
    billRepository,
    reviewQueueRepository,
  } = deps;

  // Alias for historical naming
  const recordRepository = financialRecordRepository;
  const cardRepository = creditCardRepository;
  const occurrenceRepository = recurrenceOccurrenceRepository;
  const auditRepository = auditLogRepository;

  // Initialize services
  const financialRecordService = new FinancialRecordService({
    accountRepository,
    recordRepository,
    ledgerRepository,
    auditRepository,
    idempotencyRepository,
  });

  const categoryService = new CategoryService({ categoryRepository });

  const cardInvoiceService = new CardInvoiceService({
    cardRepository,
    invoiceRepository,
    recordRepository,
    ledgerRepository,
    auditRepository,
    installmentGroupRepository,
    accountRepository,
  });

  const recurrenceService = new RecurrenceService({
    recurrenceRepository,
    occurrenceRepository,
    recordRepository,
    ledgerRepository,
    auditRepository,
    billRepository,
    cardRepository,
    invoiceRepository,
    installmentGroupRepository,
    accountRepository,
  });

  // Initialize Review Service
  const reviewService = options.reviewService ?? new ReviewService({
    reviewQueueRepository,
    recordRepository,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Source Message Store for WhatsApp webhook (in-memory)
  // ─────────────────────────────────────────────────────────────────────────

  interface SourceMessage {
    providerMessageId: string;
    processed: boolean;
    errorReason?: string;
  }

  class InMemorySourceMessageStore {
    private messages = new Map<string, SourceMessage>();

    isProcessed(providerMessageId: string): boolean {
      return this.messages.get(providerMessageId)?.processed ?? false;
    }

    markProcessed(providerMessageId: string): void {
      this.messages.set(providerMessageId, { providerMessageId, processed: true });
    }

    saveError(providerMessageId: string, reason: string): void {
      this.messages.set(providerMessageId, { providerMessageId, processed: true, errorReason: reason });
    }
  }

  // Store for WhatsApp webhook
  const sourceMessageStore = new InMemorySourceMessageStore();

  // ─────────────────────────────────────────────────────────────────────────
  // Health Check
  // ─────────────────────────────────────────────────────────────────────────

  app.get('/health', async () => ({ ok: true }));

  // ─────────────────────────────────────────────────────────────────────────
  // Accounts
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;

    // Validate input
    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }
    if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
      return reply.status(400).send({ success: false, reason: 'name é obrigatório' });
    }
    if (!body.type || !['checking', 'savings', 'cash', 'credit_card', 'investment'].includes(body.type as string)) {
      return reply.status(400).send({ success: false, reason: 'type inválido' });
    }
    if (!body.scope || !['shared', 'personal'].includes(body.scope as string)) {
      return reply.status(400).send({ success: false, reason: 'scope inválido' });
    }

    const now = new Date().toISOString();
    const account: Account = {
      id: (body.id as string) || crypto.randomUUID(),
      householdId: body.householdId as string,
      name: body.name as string,
      type: body.type as AccountType,
      scope: body.scope as AccountScope,
      ownerUserId: body.ownerUserId as string | null ?? null,
      initialBalanceCents: (body.initialBalanceCents as number) || 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    const created = await accountRepository.create(account);
    return reply.status(201).send({ success: true, data: created });
  });

  app.get('/accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    const { householdId } = request.query as { householdId?: string };

    if (!householdId) {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }

    const accounts = await accountRepository.findByHouseholdId(householdId);
    return reply.status(200).send({ success: true, data: accounts });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Categories
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/categories/find-or-create', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }
    if (!body.name || typeof body.name !== 'string') {
      return reply.status(400).send({ success: false, reason: 'name é obrigatório' });
    }
    if (!body.kind || !['income', 'expense'].includes(body.kind as string)) {
      return reply.status(400).send({ success: false, reason: 'kind inválido' });
    }

    const result = await categoryService.findOrCreateCategory({
      householdId: body.householdId as string,
      name: body.name as string,
      kind: body.kind as CategoryKind,
    });

    return reply.status(200).send({ success: true, data: result });
  });

  app.get('/categories', async (request: FastifyRequest, reply: FastifyReply) => {
    const { householdId } = request.query as { householdId?: string };

    if (!householdId) {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }

    const categories = await categoryRepository.findByHouseholdId(householdId);
    return reply.status(200).send({ success: true, data: categories });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Records (expense, income, transfer)
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/records/expense', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }
    if (!body.accountId || typeof body.accountId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'accountId é obrigatório' });
    }
    if (typeof body.amountCents !== 'number' || body.amountCents <= 0) {
      return reply.status(400).send({ success: false, reason: 'amountCents deve ser positivo' });
    }
    if (!body.description || typeof body.description !== 'string') {
      return reply.status(400).send({ success: false, reason: 'description é obrigatório' });
    }
    if (!body.date || typeof body.date !== 'string') {
      return reply.status(400).send({ success: false, reason: 'date é obrigatório' });
    }
    if (!body.source || !['whatsapp', 'dashboard', 'cron', 'agent'].includes(body.source as string)) {
      return reply.status(400).send({ success: false, reason: 'source inválido' });
    }

    const result = await financialRecordService.createExpense({
      householdId: body.householdId as string,
      accountId: body.accountId as string,
      amountCents: body.amountCents as number,
      description: body.description as string,
      date: body.date as string,
      categoryId: body.categoryId as string | undefined,
      source: body.source as 'whatsapp' | 'dashboard' | 'cron' | 'agent',
      idempotencyKey: body.idempotencyKey as string | undefined,
      sourceMessageId: body.sourceMessageId as string | undefined,
    });

    if (!result.success) {
      return reply.status(422).send({ success: false, reason: result.reason });
    }

    return reply.status(201).send({ success: true, data: result.record });
  });

  app.post('/records/income', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }
    if (!body.accountId || typeof body.accountId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'accountId é obrigatório' });
    }
    if (typeof body.amountCents !== 'number' || body.amountCents <= 0) {
      return reply.status(400).send({ success: false, reason: 'amountCents deve ser positivo' });
    }
    if (!body.description || typeof body.description !== 'string') {
      return reply.status(400).send({ success: false, reason: 'description é obrigatório' });
    }
    if (!body.date || typeof body.date !== 'string') {
      return reply.status(400).send({ success: false, reason: 'date é obrigatório' });
    }
    if (!body.source || !['whatsapp', 'dashboard', 'cron', 'agent'].includes(body.source as string)) {
      return reply.status(400).send({ success: false, reason: 'source inválido' });
    }

    const result = await financialRecordService.createIncome({
      householdId: body.householdId as string,
      accountId: body.accountId as string,
      amountCents: body.amountCents as number,
      description: body.description as string,
      date: body.date as string,
      categoryId: body.categoryId as string | undefined,
      source: body.source as 'whatsapp' | 'dashboard' | 'cron' | 'agent',
      idempotencyKey: body.idempotencyKey as string | undefined,
    });

    if (!result.success) {
      return reply.status(422).send({ success: false, reason: result.reason });
    }

    return reply.status(201).send({ success: true, data: result.record });
  });

  app.post('/records/transfer', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }
    if (!body.fromAccountId || typeof body.fromAccountId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'fromAccountId é obrigatório' });
    }
    if (!body.toAccountId || typeof body.toAccountId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'toAccountId é obrigatório' });
    }
    if (typeof body.amountCents !== 'number' || body.amountCents <= 0) {
      return reply.status(400).send({ success: false, reason: 'amountCents deve ser positivo' });
    }
    if (!body.description || typeof body.description !== 'string') {
      return reply.status(400).send({ success: false, reason: 'description é obrigatório' });
    }
    if (!body.date || typeof body.date !== 'string') {
      return reply.status(400).send({ success: false, reason: 'date é obrigatório' });
    }
    if (!body.source || !['whatsapp', 'dashboard', 'cron', 'agent'].includes(body.source as string)) {
      return reply.status(400).send({ success: false, reason: 'source inválido' });
    }

    const result = await financialRecordService.createTransfer({
      householdId: body.householdId as string,
      fromAccountId: body.fromAccountId as string,
      toAccountId: body.toAccountId as string,
      amountCents: body.amountCents as number,
      description: body.description as string,
      date: body.date as string,
      source: body.source as 'whatsapp' | 'dashboard' | 'cron' | 'agent',
      idempotencyKey: body.idempotencyKey as string | undefined,
    });

    if (!result.success) {
      return reply.status(422).send({ success: false, reason: result.reason });
    }

    return reply.status(201).send({ success: true, data: result.record });
  });

  app.get('/records', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      householdId?: string;
      type?: string;
      accountId?: string;
      cardId?: string;
      categoryId?: string;
      dateFrom?: string;
      dateTo?: string;
      source?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };

    if (!query.householdId) {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }

    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    const { records, total } = await recordRepository.findByHouseholdIdFiltered(query.householdId, {
      type: query.type,
      accountId: query.accountId,
      cardId: query.cardId,
      categoryId: query.categoryId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      source: query.source,
      status: query.status,
      limit,
      offset,
    });

    return reply.status(200).send({ success: true, data: records, total });
  });

  app.patch('/records/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }

    const result = await financialRecordService.updateRecord({
      householdId: body.householdId as string,
      recordId: id,
      userId: body.userId as string | undefined,
      updates: {
        description: body.description as string | undefined,
        amountCents: body.amountCents as number | undefined,
        date: body.date as string | undefined,
        categoryId: body.categoryId as string | null | undefined,
        status: body.status as 'posted' | 'scheduled' | 'paid' | 'overdue' | 'cancelled' | 'review' | undefined,
      },
      source: (body.source as 'whatsapp' | 'dashboard' | 'cron' | 'agent') || 'dashboard',
    });

    if (!result.success) {
      return reply.status(404).send({ success: false, reason: result.reason });
    }

    return reply.status(200).send({ success: true, data: result.record });
  });

  app.delete('/records/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }

    const result = await financialRecordService.softDeleteRecord({
      householdId: body.householdId as string,
      recordId: id,
      userId: body.userId as string | undefined,
      source: (body.source as 'whatsapp' | 'dashboard' | 'cron' | 'agent') || 'dashboard',
    });

    if (!result.success) {
      return reply.status(404).send({ success: false, reason: result.reason });
    }

    return reply.status(200).send({ success: true, data: result.record });
  });

  app.post('/records/:id/undo', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }

    const result = await financialRecordService.undoRecord({
      householdId: body.householdId as string,
      recordId: id,
      userId: body.userId as string | undefined,
      source: (body.source as 'whatsapp' | 'dashboard' | 'cron' | 'agent') || 'dashboard',
    });

    if (!result.success) {
      return reply.status(404).send({ success: false, reason: result.reason });
    }

    return reply.status(200).send({
      success: true,
      data: {
        originalRecord: result.originalRecord,
        reversalRecord: result.reversalRecord,
      },
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Cards
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/cards', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }
    if (!body.name || typeof body.name !== 'string') {
      return reply.status(400).send({ success: false, reason: 'name é obrigatório' });
    }
    if (!body.scope || !['shared', 'personal'].includes(body.scope as string)) {
      return reply.status(400).send({ success: false, reason: 'scope inválido' });
    }
    if (typeof body.closingDay !== 'number' || body.closingDay < 1 || body.closingDay > 31) {
      return reply.status(400).send({ success: false, reason: 'closingDay deve ser 1-31' });
    }
    if (typeof body.dueDay !== 'number' || body.dueDay < 1 || body.dueDay > 31) {
      return reply.status(400).send({ success: false, reason: 'dueDay deve ser 1-31' });
    }

    const now = new Date().toISOString();
    const card: CreditCard = {
      id: (body.id as string) || crypto.randomUUID(),
      householdId: body.householdId as string,
      name: body.name as string,
      ownerUserId: body.ownerUserId as string | null ?? null,
      scope: body.scope as 'shared' | 'personal',
      limitCents: body.limitCents as number | null ?? null,
      closingDay: body.closingDay as number,
      dueDay: body.dueDay as number,
      paymentAccountId: body.paymentAccountId as string | null ?? null,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    const created = await cardRepository.create(card);
    return reply.status(201).send({ success: true, data: created });
  });

  app.get('/cards', async (request: FastifyRequest, reply: FastifyReply) => {
    const { householdId } = request.query as { householdId?: string };

    if (!householdId) {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }

    const cards = await cardRepository.findByHouseholdId(householdId);
    return reply.status(200).send({ success: true, data: cards });
  });

  app.post('/cards/purchase', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }
    if (!body.cardId || typeof body.cardId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'cardId é obrigatório' });
    }
    if (typeof body.amountCents !== 'number' || body.amountCents <= 0) {
      return reply.status(400).send({ success: false, reason: 'amountCents deve ser positivo' });
    }
    if (!body.description || typeof body.description !== 'string') {
      return reply.status(400).send({ success: false, reason: 'description é obrigatório' });
    }
    if (!body.purchaseDate || typeof body.purchaseDate !== 'string') {
      return reply.status(400).send({ success: false, reason: 'purchaseDate é obrigatório' });
    }
    if (!body.source || !['whatsapp', 'dashboard', 'cron', 'agent'].includes(body.source as string)) {
      return reply.status(400).send({ success: false, reason: 'source inválido' });
    }

    const result = await cardInvoiceService.createCardPurchase({
      householdId: body.householdId as string,
      cardId: body.cardId as string,
      amountCents: body.amountCents as number,
      description: body.description as string,
      purchaseDate: body.purchaseDate as string,
      source: body.source as 'whatsapp' | 'dashboard' | 'cron' | 'agent',
      categoryId: body.categoryId as string | undefined,
    });

    if (!result.success) {
      return reply.status(422).send({ success: false, reason: result.reason });
    }

    return reply.status(201).send({ 
      success: true, 
      data: { 
        record: result.record,
        invoiceId: result.record?.invoiceId,
      }
    });
  });

  app.post('/cards/installments', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }
    if (!body.cardId || typeof body.cardId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'cardId é obrigatório' });
    }
    if (typeof body.amountCents !== 'number' || body.amountCents <= 0) {
      return reply.status(400).send({ success: false, reason: 'amountCents deve ser positivo' });
    }
    if (!body.description || typeof body.description !== 'string') {
      return reply.status(400).send({ success: false, reason: 'description é obrigatório' });
    }
    if (typeof body.installmentsCount !== 'number' || body.installmentsCount < 2) {
      return reply.status(400).send({ success: false, reason: 'installmentsCount deve ser >= 2' });
    }
    if (!body.firstDate || typeof body.firstDate !== 'string') {
      return reply.status(400).send({ success: false, reason: 'firstDate é obrigatório' });
    }
    if (!body.source || !['whatsapp', 'dashboard', 'cron', 'agent'].includes(body.source as string)) {
      return reply.status(400).send({ success: false, reason: 'source inválido' });
    }

    const result = await cardInvoiceService.createInstallmentPurchase({
      householdId: body.householdId as string,
      cardId: body.cardId as string,
      amountCents: body.amountCents as number,
      description: body.description as string,
      installmentsCount: body.installmentsCount as number,
      firstDate: body.firstDate as string,
      source: body.source as 'whatsapp' | 'dashboard' | 'cron' | 'agent',
      categoryId: body.categoryId as string | undefined,
    });

    if (!result.success) {
      return reply.status(422).send({ success: false, reason: result.reason });
    }

    return reply.status(201).send({ success: true, data: { installmentGroup: result.installmentGroup } });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Invoices
  // ─────────────────────────────────────────────────────────────────────────

  app.get('/invoices', async (request: FastifyRequest, reply: FastifyReply) => {
    const { householdId, cardId } = request.query as { householdId?: string; cardId?: string };

    if (!householdId) {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }

    let invoices = await invoiceRepository.findByHouseholdId(householdId);
    
    if (cardId) {
      invoices = invoices.filter(inv => inv.cardId === cardId);
    }

    return reply.status(200).send({ success: true, data: invoices });
  });

  app.post('/invoices/:id/close', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }

    const result = await cardInvoiceService.closeInvoice({
      householdId: body.householdId as string,
      invoiceId: id,
    });

    if (!result.success) {
      return reply.status(422).send({ success: false, reason: result.reason });
    }

    return reply.status(200).send({ success: true, data: result.invoice });
  });

  app.post('/invoices/:id/pay', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }
    if (typeof body.amountCents !== 'number' || body.amountCents <= 0) {
      return reply.status(400).send({ success: false, reason: 'amountCents deve ser positivo' });
    }
    if (!body.paymentDate || typeof body.paymentDate !== 'string') {
      return reply.status(400).send({ success: false, reason: 'paymentDate é obrigatório' });
    }
    if (!body.source || !['whatsapp', 'dashboard', 'cron', 'agent'].includes(body.source as string)) {
      return reply.status(400).send({ success: false, reason: 'source inválido' });
    }

    const result = await cardInvoiceService.payInvoice({
      householdId: body.householdId as string,
      invoiceId: id,
      paymentAccountId: body.paymentAccountId as string | undefined,
      amountCents: body.amountCents as number,
      paymentDate: body.paymentDate as string,
      source: body.source as 'whatsapp' | 'dashboard' | 'cron' | 'agent',
    });

    if (!result.success) {
      return reply.status(422).send({ success: false, reason: result.reason });
    }

    return reply.status(201).send({ success: true, data: result.record });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Recurrences
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/recurrences', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }
    if (!body.description || typeof body.description !== 'string') {
      return reply.status(400).send({ success: false, reason: 'description é obrigatório' });
    }
    if (typeof body.amountCents !== 'number' || body.amountCents <= 0) {
      return reply.status(400).send({ success: false, reason: 'amountCents deve ser positivo' });
    }
    if (!body.period || !['daily', 'weekly', 'biweekly', 'monthly', 'yearly'].includes(body.period as string)) {
      return reply.status(400).send({ success: false, reason: 'period inválido' });
    }
    if (!body.targetType || !['payable_bill', 'account_debit', 'card_charge'].includes(body.targetType as string)) {
      return reply.status(400).send({ success: false, reason: 'targetType inválido' });
    }
    if (!body.firstDate || typeof body.firstDate !== 'string') {
      return reply.status(400).send({ success: false, reason: 'firstDate é obrigatório' });
    }

    const result = await recurrenceService.createRecurrence({
      householdId: body.householdId as string,
      description: body.description as string,
      amountCents: body.amountCents as number,
      period: body.period as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly',
      targetType: body.targetType as 'payable_bill' | 'account_debit' | 'card_charge',
      firstDate: body.firstDate as string,
      accountId: body.accountId as string | null | undefined,
      cardId: body.cardId as string | null | undefined,
      categoryId: body.categoryId as string | null | undefined,
    });

    if (!result.success) {
      return reply.status(422).send({ success: false, reason: result.reason });
    }

    return reply.status(201).send({ success: true, data: { recurrence: result.recurrence, occurrences: result.occurrences } });
  });

  app.post('/recurrences/:id/maintain-horizon', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const result = await recurrenceService.maintainHorizon(id);

    if (!result.success) {
      return reply.status(422).send({ success: false, reason: result.reason });
    }

    return reply.status(200).send({ success: true, data: { success: true, createdCount: result.createdCount } });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Bills
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/bills/:id/pay', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    if (!body.householdId || typeof body.householdId !== 'string') {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }
    if (typeof body.amountCents !== 'number' || body.amountCents <= 0) {
      return reply.status(400).send({ success: false, reason: 'amountCents deve ser positivo' });
    }
    if (!body.paymentDate || typeof body.paymentDate !== 'string') {
      return reply.status(400).send({ success: false, reason: 'paymentDate é obrigatório' });
    }

    const result = await recurrenceService.payBill({
      householdId: body.householdId as string,
      billId: id,
      paymentAccountId: body.paymentAccountId as string | null | undefined,
      amountCents: body.amountCents as number,
      paymentDate: body.paymentDate as string,
    });

    if (!result.success) {
      return reply.status(422).send({ success: false, reason: result.reason });
    }

    return reply.status(201).send({ success: true, data: { record: result.record, interestRecord: result.interestRecord } });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Review Queue
  // ─────────────────────────────────────────────────────────────────────────

  app.get('/review', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { householdId?: string; status?: string };
    
    if (!query.householdId) {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }

    const entries = query.status === 'all'
      ? await reviewService.listAll(query.householdId)
      : await reviewService.listPending(query.householdId);

    const count = await reviewService.pendingCount(query.householdId);

    return reply.send({ success: true, entries, pendingCount: count });
  });

  app.get('/review/count', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { householdId?: string };
    
    if (!query.householdId) {
      return reply.status(400).send({ success: false, reason: 'householdId é obrigatório' });
    }

    const count = await reviewService.pendingCount(query.householdId);

    return reply.send({ success: true, count });
  });

  app.post('/review/:id/approve', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const body = request.body as { userId?: string };

    if (!body.userId) {
      return reply.status(400).send({ success: false, reason: 'userId é obrigatório' });
    }

    const result = await reviewService.approve(id, body.userId);

    if (!result.success) {
      return reply.status(400).send(result);
    }

    return reply.send(result);
  });

  app.post('/review/:id/reject', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const body = request.body as { userId?: string; cancelRecord?: boolean };

    if (!body.userId) {
      return reply.status(400).send({ success: false, reason: 'userId é obrigatório' });
    }

    const result = await reviewService.reject(id, body.userId, body.cancelRecord);

    if (!result.success) {
      return reply.status(400).send(result);
    }

    return reply.send(result);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // WhatsApp Webhook (Evolution API)
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/webhooks/evolution', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown>;

    // Validate webhook secret
    if (options.webhookSecret && body.secret !== options.webhookSecret) {
      return reply.status(403).send({ success: false, reason: 'secret inválido' });
    }

    // Extract message info
    const data = body.data as {
      key?: { remoteJid?: string; fromMe?: boolean; id?: string };
      message?: { conversation?: string; extendedTextMessage?: { text?: string } };
      pushName?: string;
    };

    if (!data?.key?.remoteJid) {
      return reply.status(400).send({ success: false, reason: 'payload inválido' });
    }

    const remoteJid = data.key.remoteJid;
    const providerMessageId = data.key.id || '';

    // Validate group
    if (options.allowedGroupIds && !options.allowedGroupIds.includes(remoteJid)) {
      return reply.status(403).send({ success: false, reason: 'grupo não permitido' });
    }

    // Validate sender phone (for logging/audit purposes)

    // Check idempotency
    if (sourceMessageStore.isProcessed(providerMessageId)) {
      return reply.status(200).send({ success: false, reason: 'mensagem duplicada' });
    }

    // Extract text
    const text = data.message?.conversation || data.message?.extendedTextMessage?.text || '';

    // Mark as processed
    sourceMessageStore.markProcessed(providerMessageId);

    // In a real implementation, this would call Pi RPC
    // For now, just acknowledge the message
    return reply.status(200).send({ 
      success: true, 
      data: { messageId: providerMessageId, text },
    });
  });

  return app;
}
