// ─────────────────────────────────────────────────────────────────────────────
// Tool Executor - Integrates Domain Services with Tool Registry
// ─────────────────────────────────────────────────────────────────────────────

import { ToolRegistry } from './tool-registry.js';
import { toolSuccess, toolFailure, type ToolContext } from './tool-result.js';
import type {
  FinancialRecordService,
  CardInvoiceService,
  RecurrenceService,
  CategoryService,
} from '@pi-financeiro/domain';

// ─────────────────────────────────────────────────────────────────────────────
// Tool Executor
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolExecutorDeps {
  financialRecordService: FinancialRecordService;
  cardInvoiceService: CardInvoiceService;
  recurrenceService: RecurrenceService;
  categoryService: CategoryService;
  reviewService?: {
    approve: (entryId: string, userId: string) => Promise<{ success: boolean; reason?: string }>;
    reject: (entryId: string, userId: string, cancelRecord?: boolean) => Promise<{ success: boolean; reason?: string }>;
  };
  reportService?: {
    getCurrentMonthSummary: (householdId: string) => Promise<{ success: boolean; summary?: unknown; reason?: string }>;
    getCategoryBreakdown: (householdId: string, dateFrom: string, dateTo: string, type: 'income' | 'expense') => Promise<{ success: boolean; breakdown?: unknown[]; reason?: string }>;
    getAccountBalances: (householdId: string) => Promise<{ success: boolean; balances?: unknown[]; reason?: string }>;
  };
  sendWhatsAppMessage?: (groupJid: string, message: string) => Promise<{ success: boolean }>;
}

export class ToolExecutor {
  private registry: ToolRegistry;

  constructor(private deps: ToolExecutorDeps) {
    this.registry = new ToolRegistry();
    this.registerTools();
  }

  /**
   * Register all financial tools
   */
  private registerTools(): void {
    // create_expense
    this.registry.register('create_expense', {
      inputSchema: {
        type: 'object',
        properties: {
          amountCents: { type: 'number' },
          description: { type: 'string' },
          accountId: { type: 'string' },
          categoryId: { type: 'string' },
          date: { type: 'string' },
        },
        required: ['amountCents', 'description', 'date'],
      },
      handler: async (ctx, input) => {
        const { amountCents, description, accountId, categoryId, date } = input as {
          amountCents: number;
          description: string;
          accountId?: string;
          categoryId?: string;
          date: string;
        };

        const result = await this.deps.financialRecordService.createExpense({
          householdId: ctx.householdId,
          amountCents,
          description,
          accountId: accountId || '',
          categoryId,
          date,
          source: ctx.source ?? 'agent',
        });

        if (!result.success) {
          return toolFailure(result.reason || 'Erro ao criar despesa');
        }

        return toolSuccess({ recordId: result.record?.id });
      },
    });

    // create_income
    this.registry.register('create_income', {
      inputSchema: {
        type: 'object',
        properties: {
          amountCents: { type: 'number' },
          description: { type: 'string' },
          accountId: { type: 'string' },
          categoryId: { type: 'string' },
          date: { type: 'string' },
        },
        required: ['amountCents', 'description', 'date'],
      },
      handler: async (ctx, input) => {
        const { amountCents, description, accountId, categoryId, date } = input as {
          amountCents: number;
          description: string;
          accountId?: string;
          categoryId?: string;
          date: string;
        };

        const result = await this.deps.financialRecordService.createIncome({
          householdId: ctx.householdId,
          amountCents,
          description,
          accountId: accountId || '',
          categoryId,
          date,
          source: ctx.source ?? 'agent',
        });

        if (!result.success) {
          return toolFailure(result.reason || 'Erro ao criar receita');
        }

        return toolSuccess({ recordId: result.record?.id });
      },
    });

    // create_transfer
    this.registry.register('create_transfer', {
      inputSchema: {
        type: 'object',
        properties: {
          fromAccountId: { type: 'string' },
          toAccountId: { type: 'string' },
          amountCents: { type: 'number' },
          description: { type: 'string' },
          date: { type: 'string' },
        },
        required: ['fromAccountId', 'toAccountId', 'amountCents', 'date'],
      },
      handler: async (ctx, input) => {
        const { fromAccountId, toAccountId, amountCents, description, date } = input as {
          fromAccountId: string;
          toAccountId: string;
          amountCents: number;
          description?: string;
          date: string;
        };

        const result = await this.deps.financialRecordService.createTransfer({
          householdId: ctx.householdId,
          fromAccountId,
          toAccountId,
          amountCents,
          description: description ?? `Transferência`,
          date,
          source: ctx.source ?? 'agent',
        });

        if (!result.success) {
          return toolFailure(result.reason || 'Erro ao criar transferência');
        }

        return toolSuccess({ recordId: result.record?.id });
      },
    });

    // create_installment_purchase
    this.registry.register('create_installment_purchase', {
      inputSchema: {
        type: 'object',
        properties: {
          cardId: { type: 'string' },
          amountCents: { type: 'number' },
          description: { type: 'string' },
          installmentsCount: { type: 'number' },
          firstDate: { type: 'string' },
        },
        required: ['cardId', 'amountCents', 'description', 'installmentsCount', 'firstDate'],
      },
      handler: async (ctx, input) => {
        const { cardId, amountCents, description, installmentsCount, firstDate } = input as {
          cardId: string;
          amountCents: number;
          description: string;
          installmentsCount: number;
          firstDate: string;
        };

        const result = await this.deps.cardInvoiceService.createInstallmentPurchase({
          householdId: ctx.householdId,
          cardId,
          amountCents,
          description,
          installmentsCount,
          firstDate,
          source: ctx.source ?? 'agent',
        });

        if (!result.success) {
          return toolFailure(result.reason || 'Erro ao criar parcelamento');
        }

        return toolSuccess({ installmentGroupId: result.installmentGroup?.id });
      },
    });

    // create_recurrence
    this.registry.register('create_recurrence', {
      inputSchema: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          amountCents: { type: 'number' },
          period: { type: 'string' },
          targetType: { type: 'string' },
          firstDate: { type: 'string' },
          accountId: { type: 'string' },
          cardId: { type: 'string' },
        },
        required: ['description', 'amountCents', 'period', 'targetType', 'firstDate'],
      },
      handler: async (ctx, input) => {
        const { description, amountCents, period, targetType, firstDate, accountId, cardId } = input as {
          description: string;
          amountCents: number;
          period: string;
          targetType: string;
          firstDate: string;
          accountId?: string;
          cardId?: string;
        };

        const result = await this.deps.recurrenceService.createRecurrence({
          householdId: ctx.householdId,
          description,
          amountCents,
          period: period as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly',
          targetType: targetType as 'payable_bill' | 'account_debit' | 'card_charge',
          firstDate,
          accountId,
          cardId,
        });

        if (!result.success) {
          return toolFailure(result.reason || 'Erro ao criar recorrência');
        }

        return toolSuccess({
          recurrenceId: result.recurrence?.id,
          occurrencesCount: result.occurrences?.length,
        });
      },
    });

    // pay_bill
    this.registry.register('pay_bill', {
      inputSchema: {
        type: 'object',
        properties: {
          billId: { type: 'string' },
          paymentAccountId: { type: 'string' },
          amountCents: { type: 'number' },
          paymentDate: { type: 'string' },
        },
        required: ['billId', 'amountCents', 'paymentDate'],
      },
      handler: async (ctx, input) => {
        const { billId, paymentAccountId, amountCents, paymentDate } = input as {
          billId: string;
          paymentAccountId?: string;
          amountCents: number;
          paymentDate: string;
        };

        const result = await this.deps.recurrenceService.payBill({
          householdId: ctx.householdId,
          billId,
          paymentAccountId,
          amountCents,
          paymentDate,
        });

        if (!result.success) {
          return toolFailure(result.reason || 'Erro ao pagar conta');
        }

        return toolSuccess({
          recordId: result.record?.id,
          interestRecordId: result.interestRecord?.id,
        });
      },
    });

    // close_invoice
    this.registry.register('close_invoice', {
      inputSchema: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string' },
        },
        required: ['invoiceId'],
      },
      handler: async (ctx, input) => {
        const { invoiceId } = input as { invoiceId: string };

        const result = await this.deps.cardInvoiceService.closeInvoice({
          householdId: ctx.householdId,
          invoiceId,
        });

        if (!result.success) {
          return toolFailure(result.reason || 'Erro ao fechar fatura');
        }

        return toolSuccess({ invoiceId: result.invoice?.id });
      },
    });

    // pay_invoice
    this.registry.register('pay_invoice', {
      inputSchema: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string' },
          paymentAccountId: { type: 'string' },
          amountCents: { type: 'number' },
          paymentDate: { type: 'string' },
        },
        required: ['invoiceId', 'amountCents', 'paymentDate'],
      },
      handler: async (ctx, input) => {
        const { invoiceId, paymentAccountId, amountCents, paymentDate } = input as {
          invoiceId: string;
          paymentAccountId?: string;
          amountCents: number;
          paymentDate: string;
        };

        const result = await this.deps.cardInvoiceService.payInvoice({
          householdId: ctx.householdId,
          invoiceId,
          paymentAccountId,
          amountCents,
          paymentDate,
          source: ctx.source ?? 'agent',
        });

        if (!result.success) {
          return toolFailure(result.reason || 'Erro ao pagar fatura');
        }

        return toolSuccess({ recordId: result.record?.id });
      },
    });

    // find_financial_context - returns accounts, cards, categories
    this.registry.register('find_financial_context', {
      inputSchema: {
        type: 'object',
        properties: {
          accountId: { type: 'string' },
          cardId: { type: 'string' },
        },
      },
      handler: async (_ctx, _input) => {
        // This would query the repositories - for now return empty
        // Actual implementation would use accountRepository, cardRepository, etc.
        return toolSuccess({
          accounts: [],
          cards: [],
          categories: [],
        });
      },
    });

    // generate_report - connects to ReportService
    this.registry.register('generate_report', {
      inputSchema: {
        type: 'object',
        properties: {
          reportType: { type: 'string', enum: ['monthly_summary', 'category_breakdown', 'account_balances'] },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
        },
        required: ['reportType'],
      },
      handler: async (ctx, input) => {
        const { reportType, startDate, endDate } = input as {
          reportType: string;
          startDate?: string;
          endDate?: string;
        };

        if (!this.deps.reportService) {
          return toolFailure('ReportService não disponível');
        }

        if (reportType === 'monthly_summary') {
          const result = await this.deps.reportService.getCurrentMonthSummary(ctx.householdId);
          if (!result.success) return toolFailure(result.reason || 'Erro ao gerar relatório');
          return toolSuccess({ report: result.summary });
        }

        if (reportType === 'category_breakdown') {
          const now = new Date();
          const from = startDate ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          const to = endDate ?? now.toISOString();
          const incResult = await this.deps.reportService.getCategoryBreakdown(ctx.householdId, from, to, 'income');
          const expResult = await this.deps.reportService.getCategoryBreakdown(ctx.householdId, from, to, 'expense');
          return toolSuccess({ income: incResult.breakdown ?? [], expense: expResult.breakdown ?? [] });
        }

        if (reportType === 'account_balances') {
          const result = await this.deps.reportService.getAccountBalances(ctx.householdId);
          if (!result.success) return toolFailure(result.reason || 'Erro ao gerar relatório');
          return toolSuccess({ balances: result.balances });
        }

        return toolFailure(`Tipo de relatório desconhecido: ${reportType}`);
      },
    });

    // create_category_if_needed
    this.registry.register('create_category_if_needed', {
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          kind: { type: 'string' },
        },
        required: ['name', 'kind'],
      },
      handler: async (ctx, input) => {
        const { name, kind } = input as {
          name: string;
          kind: string;
        };

        try {
          const result = await this.deps.categoryService.findOrCreateCategory({
            householdId: ctx.householdId,
            name,
            kind: kind as 'income' | 'expense',
          });

          return toolSuccess({ categoryId: result.category.id, created: result.created });
        } catch (error) {
          return toolFailure(error instanceof Error ? error.message : 'Erro ao criar/categorizar');
        }
      },
    });

    // mark_reviewed - resolves review queue entry via ReviewService
    this.registry.register('mark_reviewed', {
      inputSchema: {
        type: 'object',
        properties: {
          reviewEntryId: { type: 'string' },
          action: { type: 'string', enum: ['approve', 'reject'] },
        },
        required: ['reviewEntryId', 'action'],
      },
      handler: async (ctx, input) => {
        const { reviewEntryId, action } = input as {
          reviewEntryId: string;
          action: 'approve' | 'reject';
        };

        if (!this.deps.reviewService) {
          return toolFailure('ReviewService não disponível');
        }

        const targetUser = ctx.userId ?? '';
        if (!targetUser) {
          return toolFailure('userId não disponível no contexto');
        }

        const result = action === 'approve'
          ? await this.deps.reviewService.approve(reviewEntryId, targetUser)
          : await this.deps.reviewService.reject(reviewEntryId, targetUser);

        if (!result.success) {
          return toolFailure(result.reason || `Erro ao ${action} entrada`);
        }

        return toolSuccess({ entryId: reviewEntryId, action, resolved: true });
      },
    });

    // undo_last_action - uses financialRecordService.undoRecord
    this.registry.register('undo_last_action', {
      inputSchema: {
        type: 'object',
        properties: {
          recordId: { type: 'string' },
          householdId: { type: 'string' },
        },
      },
      handler: async (ctx, input) => {
        const { recordId, householdId } = input as { recordId?: string; householdId?: string };
        const targetHousehold = householdId ?? ctx.householdId;

        if (!recordId) {
          return toolFailure('recordId é obrigatório');
        }

        const result = await this.deps.financialRecordService.undoRecord({ recordId, householdId: targetHousehold });

        if (!result.success) {
          return toolFailure(result.reason || 'Erro ao desfazer');
        }

        return toolSuccess({
          originalRecordId: result.originalRecord?.id,
          reversalRecordId: result.reversalRecord?.id,
        });
      },
    });

    // send_whatsapp_message - uses sendWhatsAppMessage callback (Evolution API)
    this.registry.register('send_whatsapp_message', {
      inputSchema: {
        type: 'object',
        properties: {
          groupJid: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['message'],
      },
      handler: async (_ctx, input) => {
        const { groupJid, message } = input as { groupJid?: string; message: string };

        if (!this.deps.sendWhatsAppMessage) {
          return toolFailure('send_whatsapp_message: Evolution API não configurada');
        }

        const target = groupJid ?? '';
        const result = await this.deps.sendWhatsAppMessage(target, message);

        if (!result.success) {
          return toolFailure('Falha ao enviar mensagem WhatsApp');
        }

        return toolSuccess({ sent: true });
      },
    });
  }

  /**
   * Execute a tool by name
   * API: executeTool(name, context, input?)
   */
  async executeTool(name: string, context: ToolContext, input?: unknown): Promise<ReturnType<ToolRegistry['execute']>> {
    return this.registry.execute(name, input ?? {}, context);
  }

  /**
   * List all registered tools
   */
  listTools(): string[] {
    return this.registry.listTools();
  }
}