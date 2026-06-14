/**
 * Domain types — match iphone-finance-app-v1 spec section "Data Contracts".
 * These are the source of truth for app + API; persistence adapter will
 * implement them against Postgres later.
 */

export type MoneyCents = number;
export type ISODate = string; // `${number}-${number}-${number}` at runtime; widened to string for ergonomics.
export type UUID = string;

export type AccountKind = 'bank' | 'cash' | 'credit_card';
export type AccountStatus = 'active' | 'inactive';

export type Account = {
  id: UUID;
  householdId: UUID;
  name: string;
  kind: AccountKind;
  balanceCents: MoneyCents;
  status: AccountStatus;
};

export type CategoryKind = 'expense' | 'income';
export type CategoryStatus = 'active' | 'inactive';

export type Category = {
  id: UUID;
  householdId: UUID;
  name: string;
  kind: CategoryKind;
  status: CategoryStatus;
};

export type TransactionKind = 'expense' | 'income' | 'transfer';

export type Transaction = {
  id: UUID;
  householdId: UUID;
  kind: TransactionKind;
  description: string;
  amountCents: MoneyCents; // always positive
  date: ISODate;
  accountId: UUID;
  categoryId?: UUID;
  transferToAccountId?: UUID;
};

export type TransactionFilters = {
  startDate?: ISODate;
  endDate?: ISODate;
  accountId?: UUID;
  categoryId?: UUID;
  kind?: TransactionKind;
  minAmountCents?: MoneyCents;
  maxAmountCents?: MoneyCents;
  query?: string;
};

export type DashboardSummary = {
  householdId: UUID;
  generatedAt: string; // ISO datetime
  totalBalanceCents: MoneyCents;
  monthIncomeCents: MoneyCents;
  monthExpenseCents: MoneyCents;
  monthNetCents: MoneyCents;
  cashFlowLast30DaysCents: MoneyCents;
  topExpenses: Array<{
    transactionId: UUID;
    description: string;
    amountCents: MoneyCents;
    date: ISODate;
    categoryName?: string;
  }>;
  topExpenseCategories: Array<{ categoryId?: UUID; categoryName: string; totalCents: MoneyCents }>;
  topIncomeCategories: Array<{ categoryId?: UUID; categoryName: string; totalCents: MoneyCents }>;
  monthOverMonth: {
    incomeChangePercent: number | null;
    expenseChangePercent: number | null;
    netChangeCents: number;
  };
  alerts: Array<{ id: string; message: string; severity: 'info' | 'warn' | 'good' }>;
};

export type QuickInsight = {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warn' | 'good';
};
