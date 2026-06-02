// ─────────────────────────────────────────────────────────────────────────────
// Types - TED Finance CLI
// ─────────────────────────────────────────────────────────────────────────────

export interface CliResult<T = unknown> {
  success: boolean;
  data?: T;
  reason?: string;
  recordId?: string;
}

export interface ExpenseInput {
  householdId: string;
  accountId: string;
  amountCents: number;
  description: string;
  date: string;
  categoryId?: string;
  source?: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  idempotencyKey?: string;
}

export interface IncomeInput {
  householdId: string;
  accountId: string;
  amountCents: number;
  description: string;
  date: string;
  categoryId?: string;
  source?: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  idempotencyKey?: string;
}

export interface TransferInput {
  householdId: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  description?: string;
  date: string;
  source?: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
  idempotencyKey?: string;
}

export interface InstallmentPurchaseInput {
  householdId: string;
  cardId: string;
  amountCents: number;
  description: string;
  installmentsCount: number;
  firstDate: string;
  categoryId?: string;
  source?: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
}

export interface RecurrenceInput {
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

export interface PayBillInput {
  householdId: string;
  billId: string;
  paymentAccountId?: string;
  amountCents: number;
  paymentDate: string;
}

export interface CloseInvoiceInput {
  householdId: string;
  invoiceId: string;
}

export interface PayInvoiceInput {
  householdId: string;
  invoiceId: string;
  paymentAccountId?: string;
  amountCents: number;
  paymentDate: string;
}

export interface UndoInput {
  householdId: string;
  recordId: string;
}

export interface MarkReviewedInput {
  householdId: string;
  reviewEntryId: string;
  action: 'approve' | 'reject';
}

export interface ListAccountsInput {
  householdId: string;
}

export interface ListCategoriesInput {
  householdId: string;
}

export interface GetReportInput {
  householdId: string;
  type: 'monthly-summary' | 'category-breakdown' | 'account-balances';
  dateFrom?: string;
  dateTo?: string;
}