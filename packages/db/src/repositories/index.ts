// ─────────────────────────────────────────────────────────────────────────────
// Repository Factory - Creates in-memory or Drizzle repositories
// ─────────────────────────────────────────────────────────────────────────────

import type {
  IAccountRepository,
  ICategoryRepository,
  IFinancialRecordRepository,
  ILedgerRepository,
  IAuditLogRepository,
  IIdempotencyRepository,
  ICreditCardRepository,
  IInvoiceRepository,
  IInstallmentGroupRepository,
  IRecurrenceRepository,
  IRecurrenceOccurrenceRepository,
  IBillRepository,
  IReviewQueueRepository,
} from '@pi-financeiro/domain';
import {
  InMemoryAccountRepository,
  InMemoryCategoryRepository,
  InMemoryFinancialRecordRepository,
  InMemoryLedgerRepository,
  InMemoryAuditLogRepository,
  InMemoryIdempotencyRepository,
  InMemoryCreditCardRepository,
  InMemoryInvoiceRepository,
  InMemoryInstallmentGroupRepository,
  InMemoryRecurrenceRepository,
  InMemoryRecurrenceOccurrenceRepository,
  InMemoryBillRepository,
  InMemoryReviewQueueRepository,
} from '@pi-financeiro/domain';

import type { DbClient } from '../client.js';
import { createDbClient } from '../client.js';
import { DrizzleAccountRepository } from './account.js';
import { DrizzleCategoryRepository } from './category.js';
import { DrizzleFinancialRecordRepository } from './financial-record.js';
import { DrizzleLedgerRepository } from './ledger.js';
import { DrizzleIdempotencyRepository } from './idempotency.js';
import { DrizzleAuditLogRepository } from './audit-log.js';
import { DrizzleCreditCardRepository } from './credit-card.js';
import { DrizzleInvoiceRepository } from './invoice.js';
import { DrizzleInstallmentGroupRepository } from './installment-group.js';
import { DrizzleRecurrenceRepository } from './recurrence.js';
import { DrizzleRecurrenceOccurrenceRepository } from './recurrence-occurrence.js';
import { DrizzleBillRepository } from './bill.js';
import { DrizzleReviewQueueRepository } from './review-queue.js';

// Re-export Drizzle repositories for direct use
export { DrizzleAccountRepository } from './account.js';
export { DrizzleCategoryRepository } from './category.js';
export { DrizzleFinancialRecordRepository } from './financial-record.js';
export { DrizzleLedgerRepository } from './ledger.js';
export { DrizzleIdempotencyRepository } from './idempotency.js';
export { DrizzleHouseholdRepository } from './household.js';
export { DrizzleAuditLogRepository } from './audit-log.js';
export { DrizzleCreditCardRepository } from './credit-card.js';
export { DrizzleInvoiceRepository } from './invoice.js';
export { DrizzleInstallmentGroupRepository } from './installment-group.js';
export { DrizzleRecurrenceRepository } from './recurrence.js';
export { DrizzleRecurrenceOccurrenceRepository } from './recurrence-occurrence.js';
export { DrizzleBillRepository } from './bill.js';
export { DrizzleReviewQueueRepository } from './review-queue.js';
export { DrizzleUserRepository, DrizzleSessionRepository, DrizzleLoginCodeRepository } from './auth.js';

/**
 * Repository set interface - all repositories an app needs
 */
export interface RepositorySet {
  accountRepository: IAccountRepository;
  categoryRepository: ICategoryRepository;
  financialRecordRepository: IFinancialRecordRepository;
  ledgerRepository: ILedgerRepository;
  auditLogRepository: IAuditLogRepository;
  idempotencyRepository: IIdempotencyRepository;
  creditCardRepository: ICreditCardRepository;
  invoiceRepository: IInvoiceRepository;
  installmentGroupRepository: IInstallmentGroupRepository;
  recurrenceRepository: IRecurrenceRepository;
  recurrenceOccurrenceRepository: IRecurrenceOccurrenceRepository;
  billRepository: IBillRepository;
  reviewQueueRepository: IReviewQueueRepository;
}

/**
 * Factory options
 */
export interface RepositoryFactoryOptions {
  mode: 'memory' | 'drizzle';
  databaseUrl?: string;
}

/**
 * Drizzle repositories with db client - returns both repos and client for cleanup
 */
export interface DrizzleRepositorySet extends RepositorySet {
  dbClient: DbClient;
}

/**
 * Create in-memory repositories (for tests)
 */
function createMemoryRepositories(): RepositorySet {
  return {
    accountRepository: new InMemoryAccountRepository(),
    categoryRepository: new InMemoryCategoryRepository(),
    financialRecordRepository: new InMemoryFinancialRecordRepository(),
    ledgerRepository: new InMemoryLedgerRepository(),
    auditLogRepository: new InMemoryAuditLogRepository(),
    idempotencyRepository: new InMemoryIdempotencyRepository(),
    creditCardRepository: new InMemoryCreditCardRepository(),
    invoiceRepository: new InMemoryInvoiceRepository(),
    installmentGroupRepository: new InMemoryInstallmentGroupRepository(),
    recurrenceRepository: new InMemoryRecurrenceRepository(),
    recurrenceOccurrenceRepository: new InMemoryRecurrenceOccurrenceRepository(),
    billRepository: new InMemoryBillRepository(),
    reviewQueueRepository: new InMemoryReviewQueueRepository(),
  };
}

/**
 * Create Drizzle repositories (for production)
 */
function createDrizzleRepositories(databaseUrl?: string): RepositorySet {
  const dbClient = createDbClient(databaseUrl);
  
  return {
    accountRepository: new DrizzleAccountRepository(dbClient),
    categoryRepository: new DrizzleCategoryRepository(dbClient),
    financialRecordRepository: new DrizzleFinancialRecordRepository(dbClient),
    ledgerRepository: new DrizzleLedgerRepository(dbClient),
    auditLogRepository: new DrizzleAuditLogRepository(dbClient),
    idempotencyRepository: new DrizzleIdempotencyRepository(dbClient),
    creditCardRepository: new DrizzleCreditCardRepository(dbClient),
    invoiceRepository: new DrizzleInvoiceRepository(dbClient),
    installmentGroupRepository: new DrizzleInstallmentGroupRepository(dbClient),
    recurrenceRepository: new DrizzleRecurrenceRepository(dbClient),
    recurrenceOccurrenceRepository: new DrizzleRecurrenceOccurrenceRepository(dbClient),
    billRepository: new DrizzleBillRepository(dbClient),
    reviewQueueRepository: new DrizzleReviewQueueRepository(dbClient),
  };
}

/**
 * Create Drizzle repositories with client management
 */
function createDrizzleRepositoriesWithClient(databaseUrl?: string): DrizzleRepositorySet {
  const dbClient = createDbClient(databaseUrl);
  
  return {
    dbClient,
    accountRepository: new DrizzleAccountRepository(dbClient),
    categoryRepository: new DrizzleCategoryRepository(dbClient),
    financialRecordRepository: new DrizzleFinancialRecordRepository(dbClient),
    ledgerRepository: new DrizzleLedgerRepository(dbClient),
    auditLogRepository: new DrizzleAuditLogRepository(dbClient),
    idempotencyRepository: new DrizzleIdempotencyRepository(dbClient),
    creditCardRepository: new DrizzleCreditCardRepository(dbClient),
    invoiceRepository: new DrizzleInvoiceRepository(dbClient),
    installmentGroupRepository: new DrizzleInstallmentGroupRepository(dbClient),
    recurrenceRepository: new DrizzleRecurrenceRepository(dbClient),
    recurrenceOccurrenceRepository: new DrizzleRecurrenceOccurrenceRepository(dbClient),
    billRepository: new DrizzleBillRepository(dbClient),
    reviewQueueRepository: new DrizzleReviewQueueRepository(dbClient),
  };
}

/**
 * Create a complete repository set
 */
export function createRepositories(options: RepositoryFactoryOptions): RepositorySet {
  if (options.mode === 'memory') {
    return createMemoryRepositories();
  }
  
  return createDrizzleRepositories(options.databaseUrl);
}

// Named exports for convenience
export { createDrizzleRepositories, createDrizzleRepositoriesWithClient };
