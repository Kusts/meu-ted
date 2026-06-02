// ─────────────────────────────────────────────────────────────────────────────
// API Client - TED Finance CLI
// Deterministic HTTP client with typed inputs/outputs
// ─────────────────────────────────────────────────────────────────────────────

import type { CliResult } from './types.js';
import { logShadowOperation, isShadowMode, isWriteMethod } from './shadow-logger.js';

const API_BASE_URL = process.env.FINANCE_API_URL || 'http://localhost:3000';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  reason?: string;
}

export class FinanceApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || API_BASE_URL;
  }

  /**
   * Make a typed API call
   * - In shadow mode, writes are validated but NOT executed
   * - GET operations always work in both modes
   */
  async call<T>(endpoint: string, method: string, body?: unknown): Promise<CliResult<T>> {
    // Shadow mode: validate writes but don't execute
    if (isShadowMode() && isWriteMethod(method)) {
      logShadowOperation({
        intent: this.extractIntentFromEndpoint(endpoint),
        method,
        endpoint,
        payload: body,
        validation: 'passed',
        wouldWrite: true,
      });

      // Return simulated success with the payload
      return {
        success: true,
        data: { ...(body as Record<string, unknown>), _shadow: true } as unknown as T,
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const rawData = await response.json() as Record<string, unknown>;

      if (!response.ok || rawData.success !== true) {
        return {
          success: false,
          reason: (rawData.error as string) || (rawData.reason as string) || `HTTP ${response.status}`,
        };
      }

      return {
        success: true,
        data: rawData.data as T,
      };
    } catch (error) {
      return {
        success: false,
        reason: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Extract intent name from endpoint for logging
   */
  private extractIntentFromEndpoint(endpoint: string): string {
    const match = endpoint.match(/\/api\/(\w+(?:-\w+)*)/);
    return match ? match[1].replace(/-/g, '_') : 'unknown';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Financial Records
  // ─────────────────────────────────────────────────────────────────────────

  async createExpense(input: {
    householdId: string;
    accountId: string;
    amountCents: number;
    description: string;
    date: string;
    categoryId?: string;
    source?: string;
    idempotencyKey?: string;
  }): Promise<CliResult<{ recordId: string }>> {
    return this.call('/api/financial-records/expense', 'POST', {
      householdId: input.householdId,
      accountId: input.accountId,
      amountCents: input.amountCents,
      description: input.description,
      date: input.date,
      categoryId: input.categoryId,
      source: input.source || 'agent',
      idempotencyKey: input.idempotencyKey,
    });
  }

  async createIncome(input: {
    householdId: string;
    accountId: string;
    amountCents: number;
    description: string;
    date: string;
    categoryId?: string;
    source?: string;
    idempotencyKey?: string;
  }): Promise<CliResult<{ recordId: string }>> {
    return this.call('/api/financial-records/income', 'POST', {
      householdId: input.householdId,
      accountId: input.accountId,
      amountCents: input.amountCents,
      description: input.description,
      date: input.date,
      categoryId: input.categoryId,
      source: input.source || 'agent',
      idempotencyKey: input.idempotencyKey,
    });
  }

  async createTransfer(input: {
    householdId: string;
    fromAccountId: string;
    toAccountId: string;
    amountCents: number;
    description?: string;
    date: string;
    source?: string;
    idempotencyKey?: string;
  }): Promise<CliResult<{ recordId: string }>> {
    return this.call('/api/financial-records/transfer', 'POST', {
      householdId: input.householdId,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amountCents: input.amountCents,
      description: input.description || 'Transferência',
      date: input.date,
      source: input.source || 'agent',
      idempotencyKey: input.idempotencyKey,
    });
  }

  async createInstallmentPurchase(input: {
    householdId: string;
    cardId: string;
    amountCents: number;
    description: string;
    installmentsCount: number;
    firstDate: string;
    categoryId?: string;
    source?: string;
  }): Promise<CliResult<{ installmentGroupId: string }>> {
    return this.call('/api/card-purchases/installment', 'POST', {
      householdId: input.householdId,
      cardId: input.cardId,
      amountCents: input.amountCents,
      description: input.description,
      installmentsCount: input.installmentsCount,
      firstDate: input.firstDate,
      categoryId: input.categoryId,
      source: input.source || 'agent',
    });
  }

  async createRecurrence(input: {
    householdId: string;
    description: string;
    amountCents: number;
    period: string;
    targetType: string;
    firstDate: string;
    accountId?: string;
    cardId?: string;
    categoryId?: string;
  }): Promise<CliResult<{ recurrenceId: string; occurrencesCount: number }>> {
    return this.call('/api/recurrences', 'POST', {
      householdId: input.householdId,
      description: input.description,
      amountCents: input.amountCents,
      period: input.period,
      targetType: input.targetType,
      firstDate: input.firstDate,
      accountId: input.accountId,
      cardId: input.cardId,
      categoryId: input.categoryId,
    });
  }

  async payBill(input: {
    householdId: string;
    billId: string;
    paymentAccountId?: string;
    amountCents: number;
    paymentDate: string;
  }): Promise<CliResult<{ recordId: string; interestRecordId?: string }>> {
    return this.call('/api/bills/pay', 'POST', {
      householdId: input.householdId,
      billId: input.billId,
      paymentAccountId: input.paymentAccountId,
      amountCents: input.amountCents,
      paymentDate: input.paymentDate,
    });
  }

  async closeInvoice(input: {
    householdId: string;
    invoiceId: string;
  }): Promise<CliResult<{ invoiceId: string }>> {
    return this.call('/api/invoices/close', 'POST', {
      householdId: input.householdId,
      invoiceId: input.invoiceId,
    });
  }

  async payInvoice(input: {
    householdId: string;
    invoiceId: string;
    paymentAccountId?: string;
    amountCents: number;
    paymentDate: string;
  }): Promise<CliResult<{ recordId: string }>> {
    return this.call('/api/invoices/pay', 'POST', {
      householdId: input.householdId,
      invoiceId: input.invoiceId,
      paymentAccountId: input.paymentAccountId,
      amountCents: input.amountCents,
      paymentDate: input.paymentDate,
    });
  }

  async undoRecord(input: {
    householdId: string;
    recordId: string;
  }): Promise<CliResult<{ originalRecordId: string; reversalRecordId: string }>> {
    return this.call('/api/financial-records/undo', 'POST', {
      householdId: input.householdId,
      recordId: input.recordId,
    });
  }

  async markReviewed(input: {
    householdId: string;
    reviewEntryId: string;
    action: 'approve' | 'reject';
  }): Promise<CliResult<{ resolved: boolean }>> {
    return this.call('/api/review/mark', 'POST', {
      householdId: input.householdId,
      reviewEntryId: input.reviewEntryId,
      action: input.action,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────

  async listAccounts(householdId: string): Promise<CliResult<{ accounts: unknown[] }>> {
    return this.call(`/api/accounts?householdId=${encodeURIComponent(householdId)}`, 'GET');
  }

  async listCategories(householdId: string): Promise<CliResult<{ categories: unknown[] }>> {
    return this.call(`/api/categories?householdId=${encodeURIComponent(householdId)}`, 'GET');
  }

  async getReport(input: {
    householdId: string;
    type: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<CliResult<unknown>> {
    const params = new URLSearchParams({
      householdId: input.householdId,
      type: input.type,
    });
    if (input.dateFrom) params.set('dateFrom', input.dateFrom);
    if (input.dateTo) params.set('dateTo', input.dateTo);
    
    return this.call(`/api/reports?${params}`, 'GET');
  }
}