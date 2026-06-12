// Shared row type interfaces for extension tools
// Reduces pool.query<any> usage by providing typed row shapes

export interface AccountRow {
  id: string;
  name: string;
  initial_balance_cents: string;
  active: boolean;
  created_at: Date;
}

export interface CategoryRow {
  id: string;
  name: string;
  kind: 'expense' | 'income';
  active: boolean;
}

export interface TransactionRow {
  id: string;
  household_id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  description: string | null;
  amount_cents: string;
  kind: 'expense' | 'income' | 'transfer';
  date: string;
  status: 'confirmed' | 'pending';
  source_message_id: string | null;
  deleted_at: string | null;
  created_at: Date;
}

export interface StatementRow {
  id: string;
  account_id: string;
  cycle_year_month: string;
  closing_date: string;
  due_date: string;
  total_cents: number;
  status: 'open' | 'closed' | 'paid' | 'partial' | 'overdue' | 'cancelled';
  paid_cents: number;
  created_at: Date;
}

export interface InstallmentPlanRow {
  id: string;
  household_id: string;
  account_id: string;
  category_id: string | null;
  description: string;
  total_amount_cents: string;
  installments_count: string;
  interest_rate: string;
  type: 'credit_card' | 'out_of_card';
  first_due_date: string;
  start_date: string;
  status: 'active' | 'completed' | 'cancelled';
  created_at: Date;
}

export interface NotificationSettingRow {
  id: string;
  household_id: string;
  chat_id: string;
  notification_type: string;
  enabled: boolean;
  schedule_hour: number | null;
  schedule_minute: number;
  days_of_week: number[] | null;
  threshold_days: number | null;
  threshold_percent: number | null;
  last_sent_at: string | null;
  grouping_enabled: boolean;
  grouping_max_items: number;
  grouping_window_minutes: number;
}

export interface BudgetRow {
  id: string;
  household_id: string;
  category_id: string;
  name: string;
  amount_cents: string;
  period: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string | null;
  alert_threshold: number;
  rollover: boolean;
  active: boolean;
}

export interface GoalRow {
  id: string;
  household_id: string;
  name: string;
  goal_type: 'savings' | 'income' | 'debt_payoff' | 'emergency_fund' | 'purchase';
  target_amount_cents: string;
  current_amount_cents: string;
  start_date: string;
  target_date: string | null;
  status: 'active' | 'paused' | 'achieved' | 'cancelled' | 'failed';
  notes: string | null;
}

export interface AccountPayableRow {
  id: string;
  household_id: string;
  account_id: string;
  category_id: string | null;
  description: string;
  amount_cents: string;
  type: 'recurring' | 'one_time';
  frequency: 'monthly' | 'quarterly' | 'yearly' | null;
  due_date: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
}

export interface PendingOperationRow {
  id: string;
  chat_id: string;
  household_id: string;
  operation_type: string;
  operation_data: Record<string, unknown>;
  expires_at: Date;
  created_at: Date;
}

export interface AuditLogRow {
  id: string;
  household_id: string;
  chat_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: Date;
}

export interface CreditCardAccountRow {
  id: string;
  household_id: string;
  name: string;
  credit_limit_cents: string;
  closing_day: number;
  due_day: number;
  active: boolean;
  created_at: Date;
}

// Shared query helper — use this instead of inline pool.query<any>
// All extension tools use this pattern for database access
export async function query<T>(
  text: string,
  params?: unknown[]
): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(text, params);
    return result as unknown as T;
  } finally {
    await pool.end();
  }
}