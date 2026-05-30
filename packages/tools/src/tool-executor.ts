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

    // generate_report
    this.registry.register('generate_report', {
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
        },
        required: ['type'],
      },
      handler: async (_ctx, input) => {
        const { type, startDate, endDate } = input as {
          type: string;
          startDate?: string;
          endDate?: string;
        };

        return toolSuccess({
          type,
          startDate,
          endDate,
          // Actual implementation would generate report from ledger
          summary: {},
        });
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

    // undo_last_action - requires full audit log implementation
    this.registry.register('undo_last_action', {
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        return toolFailure('undo_last_action requer funcionalidade de auditoria completa');
      },
    });

    // send_whatsapp_message - requires Evolution API integration
    this.registry.register('send_whatsapp_message', {
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
        },
        required: ['message'],
      },
      handler: async () => {
        return toolFailure('send_whatsapp_message requer integração Evolution API configurada');
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