import { pgTable, uuid, varchar, timestamp, integer, text, jsonb, boolean, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const householdCurrencyEnum = pgEnum('household_currency', ['BRL']);
export const householdTimezoneEnum = pgEnum('household_timezone', ['America/Sao_Paulo']);
export const userRoleEnum = pgEnum('user_role', ['owner', 'member']);
export const accountTypeEnum = pgEnum('account_type', ['checking', 'savings', 'credit', 'investment', 'cash']);
export const accountScopeEnum = pgEnum('account_scope', ['shared', 'personal']);
export const recordTypeEnum = pgEnum('record_type', ['income', 'expense', 'transfer', 'interest', 'adjustment']);
export const recordSourceEnum = pgEnum('record_source', ['whatsapp', 'dashboard', 'cron', 'agent']);
export const recordStatusEnum = pgEnum('record_status', ['posted', 'scheduled', 'paid', 'overdue', 'cancelled', 'review']);
export const ledgerDirectionEnum = pgEnum('ledger_direction', ['debit', 'credit']);
export const ledgerEntryTypeEnum = pgEnum('ledger_entry_type', ['cash', 'card_charge', 'invoice_payment', 'transfer', 'interest', 'adjustment', 'recurrence']);
export const cardScopeEnum = pgEnum('card_scope', ['shared', 'personal']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['open', 'closed', 'paid']);
export const recurrencePeriodEnum = pgEnum('recurrence_period', ['daily', 'weekly', 'biweekly', 'monthly', 'yearly']);
export const recurrenceOccurrenceStatusEnum = pgEnum('recurrence_occurrence_status', ['pending', 'created', 'skipped']);
export const recurrenceEditedPolicyEnum = pgEnum('recurrence_edited_policy', ['single', 'future', 'all']);
export const billStatusEnum = pgEnum('bill_status', ['pending', 'paid', 'overdue', 'cancelled']);
export const loanModeEnum = pgEnum('loan_mode', ['fixed', 'price', 'sac', 'custom']);
export const loanInstallmentStatusEnum = pgEnum('loan_installment_status', ['pending', 'paid', 'overdue']);
export const auditActionEnum = pgEnum('audit_action', ['create', 'update', 'delete', 'undo', 'restore']);
export const categoryKindEnum = pgEnum('category_kind', ['income', 'expense', 'transfer']);
export const reviewQueueStatusEnum = pgEnum('review_queue_status', ['pending', 'approved', 'rejected']);
export const entityTypeEnum = pgEnum('entity_type', ['financial_record', 'account', 'card', 'invoice', 'recurrence', 'category', 'budget', 'loan']);

// ─────────────────────────────────────────────────────────────────────────────
// Household
// ─────────────────────────────────────────────────────────────────────────────
export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  currency: householdCurrencyEnum('currency').default('BRL').notNull(),
  timezone: householdTimezoneEnum('timezone').default('America/Sao_Paulo').notNull(),
  highValueThresholdCents: integer('high_value_threshold_cents').default(50000).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Users / Auth
// ─────────────────────────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 30 }).notNull(),
  role: userRoleEnum('role').default('owner').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_users_household_id').on(table.householdId),
  index('idx_users_phone').on(table.phone),
]);

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_sessions_household_id').on(table.householdId),
  index('idx_sessions_user_id').on(table.userId),
]);

export const loginCodes = pgTable('login_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  phone: varchar('phone', { length: 30 }).notNull(),
  codeHash: varchar('code_hash', { length: 255 }).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Accounts
// ─────────────────────────────────────────────────────────────────────────────
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  type: accountTypeEnum('type').notNull(),
  ownerUserId: uuid('owner_user_id').references(() => users.id),
  scope: accountScopeEnum('scope').default('shared').notNull(),
  initialBalanceCents: integer('initial_balance_cents').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_accounts_household_id').on(table.householdId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────────────────
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  parentId: uuid('parent_id'),
  kind: categoryKindEnum('kind').notNull(),
  normalizedName: varchar('normalized_name', { length: 255 }).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_categories_household_id').on(table.householdId),
  index('idx_categories_normalized_name').on(table.normalizedName),
]);

export const categoryAliases = pgTable('category_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  alias: varchar('alias', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_category_aliases_household_id').on(table.householdId),
  unique('uniq_category_alias').on(table.categoryId, table.alias),
]);

export const categorizationRules = pgTable('categorization_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  matcher: text('matcher').notNull(),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  priority: integer('priority').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Financial Records
// ─────────────────────────────────────────────────────────────────────────────
export const financialRecords = pgTable('financial_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  type: recordTypeEnum('type').notNull(),
  amountCents: integer('amount_cents').notNull(),
  date: timestamp('date', { withTimezone: true }).notNull(),
  description: varchar('description', { length: 500 }).notNull(),
  accountId: uuid('account_id').references(() => accounts.id),
  fromAccountId: uuid('from_account_id').references(() => accounts.id),
  toAccountId: uuid('to_account_id').references(() => accounts.id),
  cardId: uuid('card_id'),
  invoiceId: uuid('invoice_id'),
  categoryId: uuid('category_id').references(() => categories.id),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  source: recordSourceEnum('source').notNull(),
  sourceMessageId: uuid('source_message_id'),
  idempotencyKey: varchar('idempotency_key', { length: 255 }),
  status: recordStatusEnum('status').default('posted').notNull(),
  recurrenceId: uuid('recurrence_id'),
  installmentGroupId: uuid('installment_group_id'),
  relatedRecordId: uuid('related_record_id'),
  merchantId: uuid('merchant_id'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  metadataJson: jsonb('metadata_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_financial_records_household_id').on(table.householdId),
  index('idx_financial_records_account_id').on(table.accountId),
  index('idx_financial_records_category_id').on(table.categoryId),
  index('idx_financial_records_date').on(table.date),
  unique('uniq_idempotency_key').on(table.idempotencyKey, table.householdId),
  unique('uniq_source_message_id').on(table.sourceMessageId, table.householdId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Ledger Entries (immutable audit trail for balances)
// ─────────────────────────────────────────────────────────────────────────────
export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  recordId: uuid('record_id').notNull().references(() => financialRecords.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => accounts.id),
  cardId: uuid('card_id'),
  invoiceId: uuid('invoice_id'),
  direction: ledgerDirectionEnum('direction').notNull(),
  amountCents: integer('amount_cents').notNull(),
  effectiveDate: timestamp('effective_date', { withTimezone: true }).notNull(),
  entryType: ledgerEntryTypeEnum('entry_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_ledger_entries_household_id').on(table.householdId),
  index('idx_ledger_entries_account_id').on(table.accountId),
  index('idx_ledger_entries_record_id').on(table.recordId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Cards / Invoices
// ─────────────────────────────────────────────────────────────────────────────
export const creditCards = pgTable('credit_cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  ownerUserId: uuid('owner_user_id').references(() => users.id),
  scope: cardScopeEnum('scope').default('shared').notNull(),
  limitCents: integer('limit_cents'),
  closingDay: integer('closing_day').notNull(),
  dueDay: integer('due_day').notNull(),
  paymentAccountId: uuid('payment_account_id').references(() => accounts.id),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_credit_cards_household_id').on(table.householdId),
]);

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  cardId: uuid('card_id').notNull().references(() => creditCards.id, { onDelete: 'cascade' }),
  periodMonth: integer('period_month').notNull(),
  periodYear: integer('period_year').notNull(),
  status: invoiceStatusEnum('status').default('open').notNull(),
  closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  totalCents: integer('total_cents').default(0).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_invoices_household_id').on(table.householdId),
  index('idx_invoices_card_id').on(table.cardId),
  unique('uniq_invoice_card_period').on(table.cardId, table.periodMonth, table.periodYear),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Installments / Recurrences
// ─────────────────────────────────────────────────────────────────────────────
export const installmentGroups = pgTable('installment_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  description: varchar('description', { length: 500 }).notNull(),
  totalCents: integer('total_cents').notNull(),
  installmentsCount: integer('installments_count').notNull(),
  firstDate: timestamp('first_date', { withTimezone: true }).notNull(),
  cardId: uuid('card_id'),
  accountId: uuid('account_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const recurrences = pgTable('recurrences', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  description: varchar('description', { length: 500 }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  period: recurrencePeriodEnum('period').notNull(),
  targetType: recordTypeEnum('target_type').notNull(),
  accountId: uuid('account_id').references(() => accounts.id),
  cardId: uuid('card_id'),
  categoryId: uuid('category_id').references(() => categories.id),
  nextDate: timestamp('next_date', { withTimezone: true }).notNull(),
  horizonMonths: integer('horizon_months').default(12).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_recurrences_household_id').on(table.householdId),
]);

export const recurrenceOccurrences = pgTable('recurrence_occurrences', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  recurrenceId: uuid('recurrence_id').notNull().references(() => recurrences.id, { onDelete: 'cascade' }),
  occurrenceDate: timestamp('occurrence_date', { withTimezone: true }).notNull(),
  recordId: uuid('record_id').references(() => financialRecords.id),
  status: recurrenceOccurrenceStatusEnum('status').default('pending').notNull(),
  editedPolicy: recurrenceEditedPolicyEnum('edited_policy').default('single').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_recurrence_occurrences_household_id').on(table.householdId),
  index('idx_recurrence_occurrences_recurrence_id').on(table.recurrenceId),
  unique('uniq_recurrence_occurrence_date').on(table.recurrenceId, table.occurrenceDate),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Bills / Loans
// ─────────────────────────────────────────────────────────────────────────────
export const bills = pgTable('bills', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  description: varchar('description', { length: 500 }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  status: billStatusEnum('status').default('pending').notNull(),
  recordId: uuid('record_id').references(() => financialRecords.id),
  recurrenceId: uuid('recurrence_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_bills_household_id').on(table.householdId),
]);

export const loans = pgTable('loans', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  principalCents: integer('principal_cents').notNull(),
  mode: loanModeEnum('mode').notNull(),
  interestRate: integer('interest_rate'),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  installmentsCount: integer('installments_count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_loans_household_id').on(table.householdId),
]);

export const loanInstallments = pgTable('loan_installments', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  loanId: uuid('loan_id').notNull().references(() => loans.id, { onDelete: 'cascade' }),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  principalCents: integer('principal_cents').notNull(),
  interestCents: integer('interest_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  status: loanInstallmentStatusEnum('status').default('pending').notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_loan_installments_household_id').on(table.householdId),
  index('idx_loan_installments_loan_id').on(table.loanId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Audit / Attachments / Merchants / Source Messages / Idempotency / Review
// ─────────────────────────────────────────────────────────────────────────────
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: auditActionEnum('action').notNull(),
  entityType: entityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  beforeJson: jsonb('before_json'),
  afterJson: jsonb('after_json'),
  source: recordSourceEnum('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_audit_logs_household_id').on(table.householdId),
  index('idx_audit_logs_entity').on(table.entityType, table.entityId),
]);

export const attachments = pgTable('attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  entityType: entityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  filePath: varchar('file_path', { length: 1000 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_attachments_household_id').on(table.householdId),
]);

export const merchants = pgTable('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  normalizedName: varchar('normalized_name', { length: 255 }).notNull(),
  defaultCategoryId: uuid('default_category_id').references(() => categories.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_merchants_household_id').on(table.householdId),
]);

export const sourceMessages = pgTable('source_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 50 }).notNull(),
  groupId: varchar('group_id', { length: 255 }),
  senderPhone: varchar('sender_phone', { length: 30 }).notNull(),
  providerMessageId: varchar('provider_message_id', { length: 255 }).notNull(),
  contentHash: varchar('content_hash', { length: 64 }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_source_messages_household_id').on(table.householdId),
  index('idx_source_messages_provider_message_id').on(table.providerMessageId),
  unique('uniq_provider_message_id').on(table.provider, table.providerMessageId),
]);

export const idempotencyKeys = pgTable('idempotency_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  key: varchar('key', { length: 255 }).notNull(),
  scope: varchar('scope', { length: 100 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
}, (table) => [
  index('idx_idempotency_keys_household_id').on(table.householdId),
  unique('uniq_idempotency_key_scope').on(table.key, table.scope),
]);

export const reviewQueue = pgTable('review_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  reason: varchar('reason', { length: 255 }).notNull(),
  payloadJson: jsonb('payload_json').notNull(),
  status: reviewQueueStatusEnum('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_review_queue_household_id').on(table.householdId),
]);

export const backups = pgTable('backups', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  path: varchar('path', { length: 1000 }).notNull(),
  checksum: varchar('checksum', { length: 64 }),
  restoreVerifiedAt: timestamp('restore_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Budgets (category budgets, account goals, custom scopes)
// ─────────────────────────────────────────────────────────────────────────────
export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  budgetType: varchar('budget_type', { length: 50 }).notNull(), // 'category_monthly', 'account_goal', 'custom'
  targetId: uuid('target_id'),
  targetType: varchar('target_type', { length: 50 }),
  amountCents: integer('amount_cents').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }),
  periodEnd: timestamp('period_end', { withTimezone: true }),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_budgets_household_id').on(table.householdId),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────────────────────
export const householdsRelations = relations(households, ({ many }) => ({
  users: many(users),
  accounts: many(accounts),
  categories: many(categories),
  financialRecords: many(financialRecords),
  ledgerEntries: many(ledgerEntries),
  creditCards: many(creditCards),
  bills: many(bills),
  loans: many(loans),
  auditLogs: many(auditLogs),
  sourceMessages: many(sourceMessages),
  idempotencyKeys: many(idempotencyKeys),
  reviewQueue: many(reviewQueue),
  budgets: many(budgets),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  household: one(households, { fields: [users.householdId], references: [households.id] }),
  sessions: many(sessions),
  accounts: many(accounts),
  financialRecords: many(financialRecords),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  household: one(households, { fields: [accounts.householdId], references: [households.id] }),
  owner: one(users, { fields: [accounts.ownerUserId], references: [users.id] }),
  financialRecords: many(financialRecords),
  ledgerEntries: many(ledgerEntries),
}));

export const financialRecordsRelations = relations(financialRecords, ({ one, many }) => ({
  household: one(households, { fields: [financialRecords.householdId], references: [households.id] }),
  account: one(accounts, { fields: [financialRecords.accountId], references: [accounts.id] }),
  fromAccount: one(accounts, { fields: [financialRecords.fromAccountId], references: [accounts.id] }),
  toAccount: one(accounts, { fields: [financialRecords.toAccountId], references: [accounts.id] }),
  category: one(categories, { fields: [financialRecords.categoryId], references: [categories.id] }),
  createdBy: one(users, { fields: [financialRecords.createdByUserId], references: [users.id] }),
  ledgerEntries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  household: one(households, { fields: [ledgerEntries.householdId], references: [households.id] }),
  record: one(financialRecords, { fields: [ledgerEntries.recordId], references: [financialRecords.id] }),
  account: one(accounts, { fields: [ledgerEntries.accountId], references: [accounts.id] }),
}));

export const creditCardsRelations = relations(creditCards, ({ one, many }) => ({
  household: one(households, { fields: [creditCards.householdId], references: [households.id] }),
  owner: one(users, { fields: [creditCards.ownerUserId], references: [users.id] }),
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  household: one(households, { fields: [invoices.householdId], references: [households.id] }),
  card: one(creditCards, { fields: [invoices.cardId], references: [creditCards.id] }),
  ledgerEntries: many(ledgerEntries),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  household: one(households, { fields: [categories.householdId], references: [households.id] }),
  parent: one(categories, { fields: [categories.parentId], references: [categories.id] }),
  children: many(categories),
  aliases: many(categoryAliases),
}));

export const recurrencesRelations = relations(recurrences, ({ one, many }) => ({
  household: one(households, { fields: [recurrences.householdId], references: [households.id] }),
  account: one(accounts, { fields: [recurrences.accountId], references: [accounts.id] }),
  category: one(categories, { fields: [recurrences.categoryId], references: [categories.id] }),
  occurrences: many(recurrenceOccurrences),
}));