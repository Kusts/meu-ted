// ─────────────────────────────────────────────────────────────────────────────
// Typed API Client for pi-financeiro Fastify API
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  reason?: string;
}

export interface Account {
  id: string;
  householdId: string;
  name: string;
  type: 'checking' | 'savings' | 'cash' | 'credit_card' | 'investment';
  scope: 'shared' | 'personal';
  ownerUserId?: string | null;
  initialBalanceCents?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  householdId: string;
  name: string;
  parentId?: string | null;
  kind: 'income' | 'expense';
  normalizedName: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialRecord {
  id: string;
  householdId: string;
  type: 'income' | 'expense' | 'transfer' | 'interest' | 'adjustment';
  amountCents: number;
  date: string;
  description: string;
  accountId?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  cardId?: string | null;
  invoiceId?: string | null;
  categoryId?: string | null;
  source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  status: 'posted' | 'scheduled' | 'paid' | 'overdue' | 'cancelled' | 'review';
  createdAt: string;
  updatedAt: string;
}

export interface CreditCard {
  id: string;
  householdId: string;
  name: string;
  ownerUserId?: string | null;
  scope: 'shared' | 'personal';
  limitCents?: number | null;
  closingDay: number;
  dueDay: number;
  paymentAccountId?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  householdId: string;
  cardId: string;
  periodMonth: number;
  periodYear: number;
  status: 'open' | 'closed' | 'paid';
  closesAt: string;
  dueAt: string;
  totalCents: number;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Recurrence {
  id: string;
  householdId: string;
  description: string;
  amountCents: number;
  period: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  targetType: 'payable_bill' | 'account_debit' | 'card_charge';
  accountId?: string | null;
  cardId?: string | null;
  categoryId?: string | null;
  firstDate: string;
  horizonMonths: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurrenceOccurrence {
  id: string;
  householdId: string;
  recurrenceId: string;
  occurrenceDate: string;
  amountCents: number;
  description: string;
  recordId?: string | null;
  billId?: string | null;
  status: 'pending' | 'processed' | 'cancelled';
  editedPolicy: 'none' | 'single' | 'future' | 'all';
  createdAt: string;
  updatedAt: string;
}

export interface InstallmentGroup {
  id: string;
  householdId: string;
  description: string;
  totalCents: number;
  installmentsCount: number;
  firstDate: string;
  cardId?: string | null;
  accountId?: string | null;
  createdAt: string;
}

export interface ReviewEntry {
  id: string;
  householdId: string;
  recordId: string | null;
  reason: 'high_value' | 'duplicate' | 'account_not_found' | 'category_conflict' | 'manual_review';
  status: 'pending' | 'approved' | 'rejected';
  originalPayload: Record<string, unknown>;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Loan {
  id: string;
  householdId: string;
  name: string;
  principalCents: number;
  mode: 'fixed' | 'price' | 'sac' | 'custom';
  interestRate: number | null;
  startDate: string;
  installmentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoanInstallment {
  id: string;
  householdId: string;
  loanId: string;
  dueDate: string;
  principalCents: number;
  interestCents: number;
  totalCents: number;
  status: 'pending' | 'paid' | 'overdue';
  paidAt: string | null;
  createdAt: string;
}

export interface Budget {
  id: string;
  householdId: string;
  name: string;
  budgetType: 'category_monthly' | 'account_goal' | 'custom';
  targetId: string | null;
  targetType: 'category' | 'account' | null;
  amountCents: number;
  periodStart: string | null;
  periodEnd: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  parentCategoryName?: string;
  amountCents: number;
  recordCount: number;
  percentage: number;
}

export interface AccountBalance {
  accountId: string;
  accountName: string;
  initialBalanceCents: number;
  debitCents: number;
  creditCents: number;
  currentBalanceCents: number;
}

export interface BudgetComparison {
  budgetId: string;
  budgetName: string;
  budgetType: string;
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  percentage: number;
  status: 'under_budget' | 'warning' | 'over_budget';
}

export interface InvoiceDue {
  invoiceId: string;
  cardName: string;
  periodMonth: number;
  periodYear: number;
  totalCents: number;
  dueAt: string;
  status: string;
  daysUntilDue: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Client Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createApiClient(
  baseUrl: string = DEFAULT_BASE_URL,
  fetchFn: typeof fetch = fetch
): {
  health: () => Promise<{ ok: boolean }>;
  listAccounts: (householdId: string) => Promise<ApiResponse<Account[]>>;
  createAccount: (input: CreateAccountInput) => Promise<ApiResponse<Account>>;
  listCategories: (householdId: string) => Promise<ApiResponse<Category[]>>;
  findOrCreateCategory: (input: FindOrCreateCategoryInput) => Promise<ApiResponse<{ category: Category; created: boolean }>>;
  createExpense: (input: CreateRecordInput) => Promise<ApiResponse<FinancialRecord>>;
  createIncome: (input: CreateRecordInput) => Promise<ApiResponse<FinancialRecord>>;
  createTransfer: (input: CreateTransferInput) => Promise<ApiResponse<FinancialRecord>>;
  getRecords: (params: {
    householdId: string;
    type?: string;
    accountId?: string;
    cardId?: string;
    categoryId?: string;
    dateFrom?: string;
    dateTo?: string;
    source?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) => Promise<ApiResponse<{ records: FinancialRecord[]; total: number }>>;
  updateRecord: (recordId: string, input: {
    householdId: string;
    description?: string;
    amountCents?: number;
    date?: string;
    categoryId?: string | null;
    status?: string;
    userId?: string;
    source?: string;
  }) => Promise<ApiResponse<FinancialRecord>>;
  deleteRecord: (recordId: string, input: {
    householdId: string;
    userId?: string;
  }) => Promise<ApiResponse<FinancialRecord>>;
  undoRecord: (recordId: string, input: {
    householdId: string;
    userId?: string;
  }) => Promise<ApiResponse<{ originalRecord: FinancialRecord; reversalRecord: FinancialRecord }>>;
  createCard: (input: CreateCardInput) => Promise<ApiResponse<CreditCard>>;
  createCardPurchase: (input: CreateCardPurchaseInput) => Promise<ApiResponse<{ record: FinancialRecord; invoiceId: string }>>;
  createCardInstallments: (input: CreateInstallmentsInput) => Promise<ApiResponse<{ installmentGroup: InstallmentGroup }>>;
  closeInvoice: (input: CloseInvoiceInput) => Promise<ApiResponse<Invoice>>;
  payInvoice: (input: PayInvoiceInput) => Promise<ApiResponse<FinancialRecord>>;
  listCards: (householdId: string) => Promise<ApiResponse<CreditCard[]>>;
  listInvoices: (householdId: string, cardId?: string) => Promise<ApiResponse<Invoice[]>>;
  createRecurrence: (input: CreateRecurrenceInput) => Promise<ApiResponse<{ recurrence: Recurrence; occurrences: RecurrenceOccurrence[] }>>;
  maintainRecurrenceHorizon: (recurrenceId: string) => Promise<ApiResponse<{ success: boolean; createdCount: number }>>;
  requestCode: (phone: string) => Promise<ApiResponse<void>>;
  verifyCode: (phone: string, code: string) => Promise<ApiResponse<{ token: string; user: { id: string; name: string; phone: string } }>>;
  seed: (householdName: string, userName: string, phone: string) => Promise<ApiResponse<{ householdId: string; userId: string; idempotent?: boolean }>>;
  revoke: () => Promise<ApiResponse<void>>;
  listReviewItems: (householdId: string, status?: 'pending' | 'all') => Promise<ApiResponse<{ entries: ReviewEntry[]; pendingCount: number }>>;
  getReviewCount: (householdId: string) => Promise<ApiResponse<{ count: number }>>;
  approveReview: (entryId: string, userId: string) => Promise<ApiResponse<ReviewEntry>>;
  rejectReview: (entryId: string, userId: string, cancelRecord?: boolean) => Promise<ApiResponse<ReviewEntry>>;
  createLoan: (input: CreateLoanInput) => Promise<ApiResponse<{ loan: Loan; installments: LoanInstallment[] }>>;
  listLoans: (householdId: string) => Promise<ApiResponse<Loan[]>>;
  payLoanInstallment: (loanId: string, householdId: string) => Promise<ApiResponse<{ success: boolean; installment?: LoanInstallment }>>;
  createBudget: (input: CreateBudgetInput) => Promise<ApiResponse<Budget>>;
  listBudgets: (householdId: string) => Promise<ApiResponse<Budget[]>>;
  getCurrentMonthSummary: (householdId: string) => Promise<ApiResponse<MonthSummary>>;
  getCategoryBreakdown: (householdId: string, dateFrom: string, dateTo: string, type: 'income' | 'expense') => Promise<ApiResponse<CategoryBreakdown[]>>;
  getAccountBalances: (householdId: string) => Promise<ApiResponse<AccountBalance[]>>;
  getBudgetVsActual: (householdId: string) => Promise<ApiResponse<BudgetComparison[]>>;
  getInvoicesDue: (householdId: string) => Promise<ApiResponse<InvoiceDue[]>>;
} {
  const api = async <T>(path: string, options?: RequestInit): Promise<T> => {
    const url = `${baseUrl}${path}`;
    const response = await fetchFn(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    const data = await response.json();
    return data as T;
  };

  return {
    // ─────────────────────────────────────────────────────────────────────────
    // Health
    // ─────────────────────────────────────────────────────────────────────────

    async health() {
      return api<{ ok: boolean }>('/health');
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Accounts
    // ─────────────────────────────────────────────────────────────────────────

    async listAccounts(householdId: string) {
      return api<ApiResponse<Account[]>>(`/accounts?householdId=${encodeURIComponent(householdId)}`);
    },

    async createAccount(input: CreateAccountInput) {
      return api<ApiResponse<Account>>('/accounts', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Categories
    // ─────────────────────────────────────────────────────────────────────────

    async listCategories(householdId: string) {
      return api<ApiResponse<Category[]>>(`/categories?householdId=${encodeURIComponent(householdId)}`);
    },

    async findOrCreateCategory(input: FindOrCreateCategoryInput) {
      return api<ApiResponse<{ category: Category; created: boolean }>>('/categories/find-or-create', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Records
    // ─────────────────────────────────────────────────────────────────────────

    async createExpense(input: CreateRecordInput) {
      return api<ApiResponse<FinancialRecord>>('/records/expense', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async createIncome(input: CreateRecordInput) {
      return api<ApiResponse<FinancialRecord>>('/records/income', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async createTransfer(input: CreateTransferInput) {
      return api<ApiResponse<FinancialRecord>>('/records/transfer', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async getRecords(params: {
      householdId: string;
      type?: string;
      accountId?: string;
      cardId?: string;
      categoryId?: string;
      dateFrom?: string;
      dateTo?: string;
      source?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }): Promise<ApiResponse<{ records: FinancialRecord[]; total: number }>> {
      const searchParams = new URLSearchParams();
      searchParams.append('householdId', params.householdId);
      if (params.type) searchParams.append('type', params.type);
      if (params.accountId) searchParams.append('accountId', params.accountId);
      if (params.cardId) searchParams.append('cardId', params.cardId);
      if (params.categoryId) searchParams.append('categoryId', params.categoryId);
      if (params.dateFrom) searchParams.append('dateFrom', params.dateFrom);
      if (params.dateTo) searchParams.append('dateTo', params.dateTo);
      if (params.source) searchParams.append('source', params.source);
      if (params.status) searchParams.append('status', params.status);
      if (params.limit) searchParams.append('limit', String(params.limit));
      if (params.offset) searchParams.append('offset', String(params.offset));

      return api<ApiResponse<{ records: FinancialRecord[]; total: number }>>(
        `/records?${searchParams.toString()}`
      );
    },

    async updateRecord(recordId: string, input: {
      householdId: string;
      description?: string;
      amountCents?: number;
      date?: string;
      categoryId?: string | null;
      status?: string;
      userId?: string;
      source?: string;
    }): Promise<ApiResponse<FinancialRecord>> {
      return api<ApiResponse<FinancialRecord>>(`/records/${recordId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      });
    },

    async deleteRecord(recordId: string, input: {
      householdId: string;
      userId?: string;
    }): Promise<ApiResponse<FinancialRecord>> {
      return api<ApiResponse<FinancialRecord>>(`/records/${recordId}`, {
        method: 'DELETE',
        body: JSON.stringify(input),
      });
    },

    async undoRecord(recordId: string, input: {
      householdId: string;
      userId?: string;
    }): Promise<ApiResponse<{
      originalRecord: FinancialRecord;
      reversalRecord: FinancialRecord;
    }>> {
      return api<ApiResponse<{
        originalRecord: FinancialRecord;
        reversalRecord: FinancialRecord;
      }>>(`/records/${recordId}/undo`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Cards
    // ─────────────────────────────────────────────────────────────────────────

    async createCard(input: CreateCardInput) {
      return api<ApiResponse<CreditCard>>('/cards', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async createCardPurchase(input: CreateCardPurchaseInput) {
      return api<ApiResponse<{ record: FinancialRecord; invoiceId: string }>>('/cards/purchase', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async createCardInstallments(input: CreateInstallmentsInput) {
      return api<ApiResponse<{ installmentGroup: InstallmentGroup }>>('/cards/installments', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Invoices
    // ─────────────────────────────────────────────────────────────────────────

    async closeInvoice(input: CloseInvoiceInput) {
      return api<ApiResponse<Invoice>>(`/invoices/${input.invoiceId}/close`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async payInvoice(input: PayInvoiceInput) {
      return api<ApiResponse<FinancialRecord>>(`/invoices/${input.invoiceId}/pay`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async listCards(householdId: string) {
      return api<ApiResponse<CreditCard[]>>(`/cards?householdId=${encodeURIComponent(householdId)}`);
    },

    async listInvoices(householdId: string, cardId?: string) {
      const params = new URLSearchParams({ householdId });
      if (cardId) params.append('cardId', cardId);
      return api<ApiResponse<Invoice[]>>(`/invoices?${params.toString()}`);
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Recurrences
    // ─────────────────────────────────────────────────────────────────────────

    async createRecurrence(input: CreateRecurrenceInput) {
      return api<ApiResponse<{ recurrence: Recurrence; occurrences: RecurrenceOccurrence[] }>>('/recurrences', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async maintainRecurrenceHorizon(recurrenceId: string) {
      return api<ApiResponse<{ success: boolean; createdCount: number }>>(`/recurrences/${recurrenceId}/maintain-horizon`, {
        method: 'POST',
      });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Loans
    // ─────────────────────────────────────────────────────────────────────────

    async createLoan(input: CreateLoanInput) {
      return api<ApiResponse<{ loan: Loan; installments: LoanInstallment[] }>>('/loans', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async listLoans(householdId: string) {
      return api<ApiResponse<Loan[]>>(`/loans?householdId=${encodeURIComponent(householdId)}`);
    },

    async payLoanInstallment(loanId: string, householdId: string) {
      return api<ApiResponse<{ success: boolean; installment?: LoanInstallment }>>(`/loans/${loanId}/pay-installment`, {
        method: 'POST',
        body: JSON.stringify({ householdId, paidAt: new Date().toISOString() }),
      });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Budgets
    // ─────────────────────────────────────────────────────────────────────────

    async createBudget(input: CreateBudgetInput) {
      return api<ApiResponse<Budget>>('/budgets', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    async listBudgets(householdId: string) {
      return api<ApiResponse<Budget[]>>(`/budgets?householdId=${encodeURIComponent(householdId)}`);
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Reports (REQ-023)
    // ─────────────────────────────────────────────────────────────────────────

    async getCurrentMonthSummary(householdId: string) {
      return api<ApiResponse<MonthSummary>>(`/reports/current-month?householdId=${encodeURIComponent(householdId)}`);
    },

    async getCategoryBreakdown(householdId: string, dateFrom: string, dateTo: string, type: 'income' | 'expense') {
      const params = new URLSearchParams({ householdId, dateFrom, dateTo, type });
      return api<ApiResponse<CategoryBreakdown[]>>(`/reports/category-breakdown?${params.toString()}`);
    },

    async getAccountBalances(householdId: string) {
      return api<ApiResponse<AccountBalance[]>>(`/reports/account-balances?householdId=${encodeURIComponent(householdId)}`);
    },

    async getBudgetVsActual(householdId: string) {
      return api<ApiResponse<BudgetComparison[]>>(`/reports/budget-vs-actual?householdId=${encodeURIComponent(householdId)}`);
    },

    async getInvoicesDue(householdId: string) {
      return api<ApiResponse<InvoiceDue[]>>(`/reports/invoices-due?householdId=${encodeURIComponent(householdId)}`);
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Auth
    // ─────────────────────────────────────────────────────────────────────────

    async requestCode(phone: string) {
      return api<ApiResponse<void>>('/auth/request-code', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
    },

    async verifyCode(phone: string, code: string) {
      return api<ApiResponse<{ token: string; user: { id: string; name: string; phone: string } }>>('/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ phone, code }),
      });
    },

    async seed(householdName: string, userName: string, phone: string) {
      return api<ApiResponse<{ householdId: string; userId: string; idempotent?: boolean }>>('/auth/seed', {
        method: 'POST',
        body: JSON.stringify({ householdName, userName, phone }),
      });
    },

    async revoke() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      return api<ApiResponse<void>>('/auth/revoke', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Review Queue
    // ─────────────────────────────────────────────────────────────────────────

    async listReviewItems(householdId: string, status: 'pending' | 'all' = 'pending') {
      return api<ApiResponse<{ entries: ReviewEntry[]; pendingCount: number }>>(
        `/review?householdId=${encodeURIComponent(householdId)}&status=${status}`
      );
    },

    async getReviewCount(householdId: string) {
      return api<ApiResponse<{ count: number }>>(
        `/review/count?householdId=${encodeURIComponent(householdId)}`
      );
    },

    async approveReview(entryId: string, userId: string) {
      return api<ApiResponse<ReviewEntry>>(`/review/${entryId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
    },

    async rejectReview(entryId: string, userId: string, cancelRecord = false) {
      return api<ApiResponse<ReviewEntry>>(`/review/${entryId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ userId, cancelRecord }),
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateAccountInput {
  householdId: string;
  name: string;
  type: 'checking' | 'savings' | 'cash' | 'credit_card' | 'investment';
  scope: 'shared' | 'personal';
  ownerUserId?: string;
  initialBalanceCents?: number;
}

export interface FindOrCreateCategoryInput {
  householdId: string;
  name: string;
  kind: 'income' | 'expense';
  parentId?: string;
}

export interface CreateRecordInput {
  householdId: string;
  accountId: string;
  amountCents: number;
  description: string;
  date: string;
  source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  categoryId?: string;
  idempotencyKey?: string;
}

export interface CreateTransferInput {
  householdId: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  description: string;
  date: string;
  source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  idempotencyKey?: string;
}

export interface CreateCardInput {
  householdId: string;
  name: string;
  scope: 'shared' | 'personal';
  closingDay: number;
  dueDay: number;
  ownerUserId?: string;
  limitCents?: number;
  paymentAccountId?: string;
}

export interface CreateCardPurchaseInput {
  householdId: string;
  cardId: string;
  amountCents: number;
  description: string;
  purchaseDate: string;
  source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  categoryId?: string;
}

export interface CreateInstallmentsInput {
  householdId: string;
  cardId: string;
  amountCents: number;
  description: string;
  installmentsCount: number;
  firstDate: string;
  source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  categoryId?: string;
}

export interface CloseInvoiceInput {
  householdId: string;
  invoiceId: string;
}

export interface PayInvoiceInput {
  householdId: string;
  invoiceId: string;
  amountCents: number;
  paymentDate: string;
  source: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  paymentAccountId?: string;
}

export interface CreateRecurrenceInput {
  householdId: string;
  description: string;
  amountCents: number;
  period: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  targetType: 'payable_bill' | 'account_debit' | 'card_charge';
  firstDate: string;
  accountId?: string;
  cardId?: string;
  categoryId?: string;
}

export interface CreateLoanInput {
  householdId: string;
  name: string;
  principalCents: number;
  mode: 'fixed' | 'price' | 'sac' | 'custom';
  interestRate?: number | null;
  startDate: string;
  installmentsCount: number;
}

export interface CreateBudgetInput {
  householdId: string;
  name: string;
  budgetType: 'category_monthly' | 'account_goal' | 'custom';
  amountCents: number;
  targetId?: string;
  targetType?: 'category' | 'account';
}
