// ─────────────────────────────────────────────────────────────────────────────
// Finance API Client for WhatsApp Bridge
// DEPRECATED — PiBridge now uses finance-cli for all operations via pi --mode rpc.
// This file is kept for potential future use (direct HTTP bypass for specific reports).
// Remove if proven unused after full migration to CLI determinístico.
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  reason?: string;
}

export interface Account {
  id: string;
  householdId: string;
  name: string;
  type: string;
  scope: string;
  initialBalanceCents: number;
}

export interface CreditCard {
  id: string;
  householdId: string;
  name: string;
  scope: string;
  closingDay: number;
  dueDay: number;
  limitCents: number | null;
}

export interface Category {
  id: string;
  householdId: string;
  name: string;
  kind: string;
  parentId: string | null;
}

export interface FinancialRecord {
  id: string;
  householdId: string;
  accountId: string;
  categoryId: string;
  type: string;
  amountCents: number;
  description: string;
  date: string;
}

export interface MonthSummary {
  householdId: string;
  month: string;
  incomeCents: number;
  expenseCents: number;
  transferCents: number;
  netCents: number;
  recordCount: number;
}

export interface AccountBalance {
  accountId: string;
  accountName: string;
  initialBalanceCents: number;
  debitCents: number;
  creditCents: number;
  currentBalanceCents: number;
}

export interface CreateExpenseInput {
  householdId: string;
  accountId: string;
  categoryId: string;
  amountCents: number;
  description: string;
  date: string;
  source: string;
}

export interface CreateIncomeInput {
  householdId: string;
  accountId: string;
  categoryId: string;
  amountCents: number;
  description: string;
  date: string;
  source: string;
}

export interface CreateTransferInput {
  householdId: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  description: string;
  date: string;
  source: string;
}

export interface CreateCardPurchaseInput {
  householdId: string;
  cardId: string;
  amountCents: number;
  description: string;
  date: string;
  installments?: number;
  categoryId?: string;
}

export interface UndoRecordInput {
  householdId: string;
  recordId?: string; // If not provided, undo last record
}

/**
 * Finance API Client
 */
export class FinanceApiClient {
  constructor(private baseUrl: string = process.env.FINANCE_API_URL ?? 'http://localhost:3000') {}

  private async request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          'Content-Type': 'application/json',
        },
        ...options,
      });
      return await response.json() as ApiResponse<T>;
    } catch (error) {
      return {
        success: false,
        reason: error instanceof Error ? error.message : 'network error',
      };
    }
  }

  /**
   * List accounts for household
   */
  async getAccounts(householdId: string): Promise<ApiResponse<Account[]>> {
    return this.request<Account[]>(`/accounts?householdId=${encodeURIComponent(householdId)}`);
  }

  /**
   * List credit cards for household
   */
  async getCards(householdId: string): Promise<ApiResponse<CreditCard[]>> {
    return this.request<CreditCard[]>(`/cards?householdId=${encodeURIComponent(householdId)}`);
  }

  /**
   * List categories for household
   */
  async getCategories(householdId: string): Promise<ApiResponse<Category[]>> {
    return this.request<Category[]>(`/categories?householdId=${encodeURIComponent(householdId)}`);
  }

  /**
   * Get recent records for household
   */
  async getRecentRecords(
    householdId: string,
    options?: { limit?: number; dateFrom?: string; dateTo?: string }
  ): Promise<ApiResponse<FinancialRecord[]>> {
    const params = new URLSearchParams({ householdId });
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.dateFrom) params.append('dateFrom', options.dateFrom);
    if (options?.dateTo) params.append('dateTo', options.dateTo);
    return this.request<FinancialRecord[]>(`/records?${params.toString()}`);
  }

  /**
   * Create expense record
   */
  async createExpense(input: CreateExpenseInput): Promise<ApiResponse<FinancialRecord>> {
    return this.request<FinancialRecord>('/records/expense', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Create income record
   */
  async createIncome(input: CreateIncomeInput): Promise<ApiResponse<FinancialRecord>> {
    return this.request<FinancialRecord>('/records/income', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Create transfer between accounts
   */
  async createTransfer(input: CreateTransferInput): Promise<ApiResponse<FinancialRecord>> {
    return this.request<FinancialRecord>('/records/transfer', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Create card purchase (installment)
   */
  async createCardPurchase(input: CreateCardPurchaseInput): Promise<ApiResponse<FinancialRecord>> {
    return this.request<FinancialRecord>('/cards/purchase', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * Get current month summary report
   */
  async getCurrentMonthSummary(householdId: string): Promise<ApiResponse<MonthSummary>> {
    return this.request<MonthSummary>(`/reports/current-month?householdId=${encodeURIComponent(householdId)}`);
  }

  /**
   * Get account balances report
   */
  async getAccountBalances(householdId: string): Promise<ApiResponse<AccountBalance[]>> {
    return this.request<AccountBalance[]>(`/reports/account-balances?householdId=${encodeURIComponent(householdId)}`);
  }

  /**
   * Undo last record or specific record
   */
  async undoRecord(input: UndoRecordInput): Promise<ApiResponse<{ undone: boolean }>> {
    // If recordId provided, undo that specific record
    // Otherwise the API will undo the last record for the household
    return this.request<{ undone: boolean }>('/records/undo', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}

/**
 * Fake Finance API Client for testing
 */
export class FakeFinanceApiClient extends FinanceApiClient {
  public accounts: Account[] = [];
  public cards: CreditCard[] = [];
  public categories: Category[] = [];
  public records: FinancialRecord[] = [];
  public shouldFail = false;
  public callLog: Array<{ method: string; path: string; input?: unknown }> = [];

  constructor() {
    super('http://fake-api');
  }

  private log(method: string, path: string, input?: unknown): void {
    this.callLog.push({ method, path, input });
  }

  async getAccounts(householdId: string): Promise<ApiResponse<Account[]>> {
    this.log('getAccounts', householdId);
    if (this.shouldFail) return { success: false, reason: 'fake error' };
    return { success: true, data: this.accounts.filter(a => a.householdId === householdId) };
  }

  async getCards(householdId: string): Promise<ApiResponse<CreditCard[]>> {
    this.log('getCards', householdId);
    if (this.shouldFail) return { success: false, reason: 'fake error' };
    return { success: true, data: this.cards.filter(c => c.householdId === householdId) };
  }

  async getCategories(householdId: string): Promise<ApiResponse<Category[]>> {
    this.log('getCategories', householdId);
    if (this.shouldFail) return { success: false, reason: 'fake error' };
    return { success: true, data: this.categories.filter(c => c.householdId === householdId) };
  }

  async getRecentRecords(householdId: string): Promise<ApiResponse<FinancialRecord[]>> {
    this.log('getRecentRecords', householdId);
    if (this.shouldFail) return { success: false, reason: 'fake error' };
    return { success: true, data: this.records.filter(r => r.householdId === householdId) };
  }

  async createExpense(input: CreateExpenseInput): Promise<ApiResponse<FinancialRecord>> {
    this.log('createExpense', '/records/expense', input);
    if (this.shouldFail) return { success: false, reason: 'fake error' };
    const record: FinancialRecord = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      accountId: input.accountId,
      categoryId: input.categoryId,
      type: 'expense',
      amountCents: input.amountCents,
      description: input.description,
      date: input.date,
    };
    this.records.push(record);
    return { success: true, data: record };
  }

  async createIncome(input: CreateIncomeInput): Promise<ApiResponse<FinancialRecord>> {
    this.log('createIncome', '/records/income', input);
    if (this.shouldFail) return { success: false, reason: 'fake error' };
    const record: FinancialRecord = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      accountId: input.accountId,
      categoryId: input.categoryId,
      type: 'income',
      amountCents: input.amountCents,
      description: input.description,
      date: input.date,
    };
    this.records.push(record);
    return { success: true, data: record };
  }

  async createTransfer(input: CreateTransferInput): Promise<ApiResponse<FinancialRecord>> {
    this.log('createTransfer', '/records/transfer', input);
    if (this.shouldFail) return { success: false, reason: 'fake error' };
    const record: FinancialRecord = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      accountId: input.fromAccountId,
      categoryId: '',
      type: 'transfer',
      amountCents: input.amountCents,
      description: input.description,
      date: input.date,
    };
    this.records.push(record);
    return { success: true, data: record };
  }

  async createCardPurchase(input: CreateCardPurchaseInput): Promise<ApiResponse<FinancialRecord>> {
    this.log('createCardPurchase', '/cards/purchase', input);
    if (this.shouldFail) return { success: false, reason: 'fake error' };
    const record: FinancialRecord = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      accountId: '',
      categoryId: input.categoryId ?? '',
      type: 'expense',
      amountCents: input.amountCents,
      description: input.description,
      date: input.date,
    };
    this.records.push(record);
    return { success: true, data: record };
  }

  async getCurrentMonthSummary(householdId: string): Promise<ApiResponse<MonthSummary>> {
    this.log('getCurrentMonthSummary', householdId);
    const records = this.records.filter(r => r.householdId === householdId);
    const incomeCents = records.filter(r => r.type === 'income').reduce((sum, r) => sum + r.amountCents, 0);
    const expenseCents = records.filter(r => r.type === 'expense').reduce((sum, r) => sum + r.amountCents, 0);
    return {
      success: true,
      data: {
        householdId,
        month: new Date().toISOString().slice(0, 7),
        incomeCents,
        expenseCents,
        transferCents: 0,
        netCents: incomeCents - expenseCents,
        recordCount: records.length,
      },
    };
  }

  async getAccountBalances(householdId: string): Promise<ApiResponse<AccountBalance[]>> {
    this.log('getAccountBalances', householdId);
    const accounts = this.accounts.filter(a => a.householdId === householdId);
    return {
      success: true,
      data: accounts.map(account => ({
        accountId: account.id,
        accountName: account.name,
        initialBalanceCents: account.initialBalanceCents,
        debitCents: 0,
        creditCents: 0,
        currentBalanceCents: account.initialBalanceCents,
      })),
    };
  }

  async undoRecord(input: UndoRecordInput): Promise<ApiResponse<{ undone: boolean }>> {
    this.log('undoRecord', '/records/undo', input);
    if (this.shouldFail) return { success: false, reason: 'fake error' };
    return { success: true, data: { undone: true } };
  }

  reset(): void {
    this.callLog = [];
    this.accounts = [];
    this.cards = [];
    this.categories = [];
    this.records = [];
    this.shouldFail = false;
  }
}