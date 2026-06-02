// ─────────────────────────────────────────────────────────────────────────────
// API Client - TED Finance CLI
// Deterministic HTTP client with typed inputs/outputs
// Routes match the Fastify API (no /api prefix — Fastify uses root paths)
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
      const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
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
    const match = endpoint.match(/\/(\w+(?:-\w+)*)/);
    return match ? match[1].replace(/-/g, '_') : 'unknown';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Financial Records
  // Route 1: create-expense → POST /records/expense
  // Route 2: create-income  → POST /records/income
  // Route 3: create-transfer → POST /records/transfer
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
    return this.call('/records/expense', 'POST', {
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
    return this.call('/records/income', 'POST', {
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
    return this.call('/records/transfer', 'POST', {
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
    return this.call('/cards/installments', 'POST', {
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
    return this.call('/recurrences', 'POST', {
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
    return this.call(`/bills/${input.billId}/pay`, 'POST', {
      householdId: input.householdId,
      paymentAccountId: input.paymentAccountId,
      amountCents: input.amountCents,
      paymentDate: input.paymentDate,
    });
  }

  async closeInvoice(input: {
    householdId: string;
    invoiceId: string;
  }): Promise<CliResult<{ invoiceId: string }>> {
    return this.call(`/invoices/${input.invoiceId}/close`, 'POST', {
      householdId: input.householdId,
    });
  }

  async payInvoice(input: {
    householdId: string;
    invoiceId: string;
    paymentAccountId?: string;
    amountCents: number;
    paymentDate: string;
  }): Promise<CliResult<{ recordId: string }>> {
    return this.call(`/invoices/${input.invoiceId}/pay`, 'POST', {
      householdId: input.householdId,
      paymentAccountId: input.paymentAccountId,
      amountCents: input.amountCents,
      paymentDate: input.paymentDate,
    });
  }

  async undoRecord(input: {
    householdId: string;
    recordId: string;
  }): Promise<CliResult<{ originalRecordId: string; reversalRecordId: string }>> {
    return this.call(`/records/${input.recordId}/undo`, 'POST', {
      householdId: input.householdId,
    });
  }

  async markReviewed(input: {
    householdId: string;
    reviewEntryId: string;
    action: 'approve' | 'reject';
  }): Promise<CliResult<{ resolved: boolean }>> {
    return this.call(`/review/${input.reviewEntryId}/${input.action}`, 'POST', {
      householdId: input.householdId,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queries
  // Route: list-accounts → GET /accounts?householdId=
  // Route: list-categories → GET /categories?householdId=
  // Route: get-report → GET /reports?householdId=&type=[monthly|category|account]
  // ─────────────────────────────────────────────────────────────────────────

  async listAccounts(householdId: string): Promise<CliResult<{ accounts: unknown[] }>> {
    return this.call(`/accounts?householdId=${encodeURIComponent(householdId)}`, 'GET');
  }

  async listCategories(householdId: string): Promise<CliResult<{ categories: unknown[] }>> {
    return this.call(`/categories?householdId=${encodeURIComponent(householdId)}`, 'GET');
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

    return this.call(`/reports?${params}`, 'GET');
  }
}