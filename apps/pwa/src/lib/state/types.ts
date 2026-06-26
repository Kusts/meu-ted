export type TransactionKind = "expense" | "income" | "transfer";

export interface Transaction {
  id: string;
  description: string;
  amountCents: number;
  date: string; // YYYY-MM-DD
  kind: TransactionKind;
  categoryId: string;
  accountId: string;
  method?: string;
  recipientName?: string;
  senderName?: string;
  installmentsTotal?: number;
  installmentsCurrent?: number;
}

export type AccountKind =
  | "checking"
  | "savings"
  | "investment"
  | "credit_card";

export interface Account {
  id: string;
  name: string;
  balanceCents: number;
  kind: AccountKind;
  creditLimitCents?: number;
  closingDay?: number;
  dueDay?: number;
  color?: string;
  /** From API response */
  status?: string;
  initialBalanceCents?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  kind: "expense" | "income";
  icon: string;
  subcategories?: string[];
  parentId?: string;
  status?: string;
}

export interface Payable {
  id: string;
  description: string;
  amountCents: number;
  dueDate: string;
  status: "pending" | "paid" | "overdue" | "cancelled";
  categoryId?: string;
  paidDate?: string;
  accountId?: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  name: string;
  amountCents: number;
  spentCents: number;
  period: "weekly" | "monthly" | "quarterly" | "yearly";
}

export interface Goal {
  id: string;
  name: string;
  goalType: "savings" | "debt_payoff" | "emergency_fund" | "purchase";
  targetAmountCents: number;
  currentAmountCents: number;
  targetDate?: string;
}

export interface Subscription {
  id: string;
  name: string;
  amountCents: number;
  cycle: "monthly" | "yearly" | "weekly";
  day: number;
  paymentMethod: string;
  status: "active" | "cancelled";
  createdAt?: string;
  cancelledAt?: string;
}

export interface Debt {
  id: string;
  name: string;
  totalAmountCents: number;
  paidAmountCents: number;
  interestRate: number; // monthly % (0.01 = 1%)
  installmentsTotal: number;
  installmentsPaid: number;
  startDate: string;
  categoryId?: string;
}

export interface DebtInstallment {
  id: string;
  debtId: string;
  index: number; // 1-based
  dueDate: string;
  amountCents: number;
  paid: boolean;
  paidDate?: string;
}

// ── Card / Statement types (API) ────────────────────────────────────

export type StatementStatus =
  | "open" | "closed" | "paid" | "partial" | "overdue" | "cancelled";

export interface CardStatement {
  id: string;
  accountId: string;
  cycleYearMonth: string;
  closingDate: string;
  dueDate: string;
  totalCents: number;
  paidCents: number;
  status: StatementStatus;
}

export interface StatementPurchase {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  categoryName?: string;
  installmentNumber?: number;
  installmentsTotal?: number;
  isRecurring?: boolean;
}

export interface StatementDetail extends CardStatement {
  purchases: StatementPurchase[];
}
