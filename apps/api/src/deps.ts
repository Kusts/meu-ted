// ─────────────────────────────────────────────────────────────────────────────
// API Dependencies Factory
// Creates repositories based on mode (memory or drizzle) via env or option
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
  ILoanRepository,
  ILoanInstallmentRepository,
  IBudgetRepository,
  IAttachmentRepository,
  IReimbursementRepository,
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
  InMemoryLoanRepository,
  InMemoryLoanInstallmentRepository,
  InMemoryBudgetRepository,
  InMemoryAttachmentRepository,
  InMemoryReimbursementRepository,
} from '@pi-financeiro/domain';

export interface ApiDependencies {
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
  loanRepository: ILoanRepository;
  loanInstallmentRepository: ILoanInstallmentRepository;
  budgetRepository: IBudgetRepository;
  attachmentRepository: IAttachmentRepository;
  reimbursementRepository: IReimbursementRepository;
}

export type DepsMode = 'memory' | 'drizzle';

export interface CreateDepsOptions {
  mode?: DepsMode;
  databaseUrl?: string;
}

/**
 * Get deps mode from environment
 * 
 * Priority:
 * 1. Explicit options.mode
 * 2. API_DEP_MODE env var (memory|drizzle)
 * 3. Default: memory (safe fallback for dev/test)
 */
function resolveMode(options: CreateDepsOptions = {}): DepsMode {
  if (options.mode) return options.mode;
  
  const envMode = process.env.API_DEP_MODE;
  if (envMode === 'drizzle') return 'drizzle';
  if (envMode === 'memory') return 'memory';
  
  // Default to memory for safe fallback
  return 'memory';
}

/**
 * Get database URL from options or environment
 */
function resolveDatabaseUrl(options: CreateDepsOptions = {}): string | undefined {
  if (options.databaseUrl) return options.databaseUrl;
  return process.env.DATABASE_URL;
}

/**
 * Create API dependencies
 * 
 * Usage:
 *   // Default: reads from env or uses memory
 *   const deps = createApiDependencies();
 *   
 *   // Explicit mode
 *   const deps = createApiDependencies({ mode: 'drizzle', databaseUrl: 'postgresql://...' });
 *   
 *   // Via environment:
 *   //   API_DEP_MODE=drizzle
 *   //   DATABASE_URL=postgresql://user:pass@host:5432/db
 */
export function createApiDependencies(options: CreateDepsOptions = {}): ApiDependencies {
  const mode = resolveMode(options);
  const databaseUrl = resolveDatabaseUrl(options);
  
  if (mode === 'memory') {
    return createMemoryDependencies();
  }
  
  // Create Drizzle dependencies
  const { createDrizzleRepositories } = loadDrizzleRepositories();
  return createDrizzleRepositories(databaseUrl);
}

/**
 * Create in-memory dependencies for testing
 */
function createMemoryDependencies(): ApiDependencies {
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
    loanRepository: new InMemoryLoanRepository(),
    loanInstallmentRepository: new InMemoryLoanInstallmentRepository(),
    budgetRepository: new InMemoryBudgetRepository(),
    attachmentRepository: new InMemoryAttachmentRepository(),
    reimbursementRepository: new InMemoryReimbursementRepository(),
  };
}

/**
 * Lazily load Drizzle repositories
 */
function loadDrizzleRepositories() {
  try {
    return require('@pi-financeiro/db/repositories');
  } catch (err) {
    console.error('Failed to load Drizzle repositories:', err);
    throw new Error('Drizzle mode requires @pi-financeiro/db package');
  }
}

/**
 * Check if Drizzle is available
 */
export function isDrizzleAvailable(): boolean {
  try {
    require('@pi-financeiro/db/repositories');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current mode as string
 */
export function getCurrentMode(): DepsMode {
  return resolveMode();
}