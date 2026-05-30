// ─────────────────────────────────────────────────────────────────────────────
// Domain Package - Core exports
// Re-exports all entities, repositories, services, and in-memory implementations
// ─────────────────────────────────────────────────────────────────────────────

// Entities
export * from './core/entities/account.js';
export * from './core/entities/category.js';
export * from './core/entities/financial-record.js';
export * from './core/entities/ledger-entry.js';
export * from './core/entities/audit-log.js';
export * from './core/entities/idempotency-key.js';
export * from './core/entities/credit-card.js';
export * from './core/entities/invoice.js';
export * from './core/entities/installment-group.js';
export * from './core/entities/recurrence.js';
export * from './core/entities/bill.js';
export * from './core/entities/user.js';
export * from './core/entities/household.js';
export * from './core/entities/session.js';
export * from './core/entities/login-code.js';
export * from './core/entities/categorization-rule.js';
export * from './core/entities/review-entry.js';

// Repository ports
export * from './core/repositories/account-repository.js';
export * from './core/repositories/category-repository.js';
export * from './core/repositories/financial-record-repository.js';
export * from './core/repositories/ledger-repository.js';
export * from './core/repositories/audit-log-repository.js';
export * from './core/repositories/idempotency-repository.js';
export * from './core/repositories/credit-card-repository.js';
export * from './core/repositories/invoice-repository.js';
export * from './core/repositories/installment-group-repository.js';
export * from './core/repositories/recurrence-repository.js';
export * from './core/repositories/recurrence-occurrence-repository.js';
export * from './core/repositories/bill-repository.js';
export * from './core/repositories/user-repository.js';
export * from './core/repositories/household-repository.js';
export * from './core/repositories/session-repository.js';
export * from './core/repositories/login-code-repository.js';
export * from './core/repositories/categorization-rule-repository.js';
export * from './core/repositories/review-queue-repository.js';

// Services
export * from './core/services/financial-record-service.js';
export * from './core/services/category-service.js';
export * from './core/services/card-invoice-service.js';
export * from './core/services/recurrence-service.js';
export * from './core/services/ted-cron-planner.js';
export * from './core/services/auth-service.js';
export * from './core/services/auto-categorization-service.js';
export * from './core/services/review-service.js';

// In-memory implementations (for tests)
export { InMemoryAccountRepository } from './in-memory/account-repository.js';
export { InMemoryCategoryRepository } from './in-memory/category-repository.js';
export { InMemoryFinancialRecordRepository } from './in-memory/financial-record-repository.js';
export { InMemoryLedgerRepository } from './in-memory/ledger-repository.js';
export { InMemoryAuditLogRepository } from './in-memory/audit-log-repository.js';
export { InMemoryIdempotencyRepository } from './in-memory/idempotency-repository.js';
export { InMemoryCreditCardRepository } from './in-memory/credit-card-repository.js';
export { InMemoryInvoiceRepository } from './in-memory/invoice-repository.js';
export { InMemoryInstallmentGroupRepository } from './in-memory/installment-group-repository.js';
export { InMemoryRecurrenceRepository } from './in-memory/recurrence-repository.js';
export { InMemoryRecurrenceOccurrenceRepository } from './in-memory/recurrence-occurrence-repository.js';
export { InMemoryBillRepository } from './in-memory/bill-repository.js';
export { InMemoryUserRepository } from './in-memory/user-repository.js';
export { InMemoryHouseholdRepository } from './in-memory/household-repository.js';
export { InMemorySessionRepository } from './in-memory/session-repository.js';
export { InMemoryLoginCodeRepository } from './in-memory/login-code-repository.js';
export { InMemoryCategorizationRuleRepository } from './in-memory/categorization-rule-repository.js';
export { InMemoryReviewQueueRepository } from './in-memory/review-queue-repository.js';

// Legacy exports (for backward compatibility with existing tests)
export { calculateAccountBalance } from './legacy.js';
export { createTransferLedgerEntries } from './legacy.js';
export { checkIdempotencyKey } from './legacy.js';
export type { TransferLedgerEntries, IdempotencyKey, DuplicateCheckResult } from './legacy.js';