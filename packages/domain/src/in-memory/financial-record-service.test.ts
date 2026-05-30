import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryFinancialRecordRepository } from './financial-record-repository.js';
import { InMemoryLedgerRepository } from './ledger-repository.js';
import { InMemoryAuditLogRepository } from './audit-log-repository.js';
import { InMemoryAccountRepository } from './account-repository.js';
import { InMemoryIdempotencyRepository } from './idempotency-repository.js';

// Service under test
import { FinancialRecordService, CreateExpenseInput } from '../core/services/financial-record-service.js';
import type { AccountType, AccountScope } from '../core/entities/account.js';

// Factory helpers
function makeAccount(overrides: Partial<{
  id: string;
  householdId: string;
  name: string;
  type: AccountType;
  scope: AccountScope;
  initialBalanceCents: number;
  active: boolean;
}> = {}): ReturnType<typeof import('../core/entities/account.js')['Account']['parse']> {
  return {
    id: crypto.randomUUID(),
    householdId: 'household-1',
    name: 'Conta Teste',
    type: 'checking' as AccountType,
    ownerUserId: null,
    scope: 'shared' as AccountScope,
    initialBalanceCents: 0,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as any;
}

function makeExpenseInput(overrides: Partial<CreateExpenseInput> = {}): CreateExpenseInput {
  return {
    householdId: 'household-1',
    accountId: 'account-1',
    amountCents: 10000,
    description: 'Supermercado',
    date: new Date().toISOString(),
    source: 'whatsapp',
    ...overrides,
  } as CreateExpenseInput;
}

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 1: Create Expense (REQ-010 negative allowed)
// RED FIRST: expense should create record + ledger debit + audit log
// ─────────────────────────────────────────────────────────────────────────────

describe('FinancialRecordService - Create Expense', () => {
  let service: FinancialRecordService;
  let accountRepo: InMemoryAccountRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let idempotencyRepo: InMemoryIdempotencyRepository;

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    idempotencyRepo = new InMemoryIdempotencyRepository();
    service = new FinancialRecordService({
      accountRepository: accountRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      idempotencyRepository: idempotencyRepo,
    });
  });

  it('REQ-010 RED: should create expense and allow negative balance when amount > balance', async () => {
    // Setup: account with R$50 balance
    const account = makeAccount({ 
      id: 'account-1',
      initialBalanceCents: 5000, // R$50
    });
    await accountRepo.create(account);

    // Try to spend R$100 (more than balance)
    const input = makeExpenseInput({ amountCents: 10000 });
    const result = await service.createExpense(input);

    // GREEN: should succeed even though balance goes negative
    expect(result.success).toBe(true);
    expect(result.record).toBeDefined();
    expect(result.record!.type).toBe('expense');
    
    // Verify ledger entry was created (debit)
    const ledgerEntries = await ledgerRepo.findByRecordId(result.record!.id);
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].direction).toBe('debit');
    expect(ledgerEntries[0].amountCents).toBe(10000);
    
    // Verify audit log was created
    const auditLogs = await auditRepo.findByEntityId('financial_record', result.record!.id);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe('create');
  });

  it('should create expense with account validation', async () => {
    const input = makeExpenseInput({ accountId: 'non-existent-account' });
    const result = await service.createExpense(input);

    expect(result.success).toBe(false);
    expect(result.reason).toContain('não encontrada');
    expect(result.record ?? null).toBeNull();
  });

  it('should create expense with household validation', async () => {
    const account = makeAccount({ id: 'account-other', householdId: 'other-household' });
    await accountRepo.create(account);

    const input = makeExpenseInput({ accountId: 'account-other' });
    const result = await service.createExpense(input);

    expect(result.success).toBe(false);
    expect(result.reason).toContain('household');
  });

  it('should create audit log on expense creation', async () => {
    const account = makeAccount({ id: 'account-1' });
    await accountRepo.create(account);

    const input = makeExpenseInput();
    const result = await service.createExpense(input);

    expect(result.success).toBe(true);
    const auditLogs = await auditRepo.findByEntityId('financial_record', result.record!.id);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe('create');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 2: Idempotency - duplicate key returns previous result (REQ-032)
// ─────────────────────────────────────────────────────────────────────────────

describe('FinancialRecordService - Idempotency', () => {
  let service: FinancialRecordService;
  let accountRepo: InMemoryAccountRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let idempotencyRepo: InMemoryIdempotencyRepository;

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    idempotencyRepo = new InMemoryIdempotencyRepository();
    service = new FinancialRecordService({
      accountRepository: accountRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      idempotencyRepository: idempotencyRepo,
    });
  });

  it('REQ-032 RED: should return previous result when idempotency key already exists', async () => {
    const account = makeAccount({ id: 'account-1' });
    await accountRepo.create(account);

    const input = makeExpenseInput({ 
      idempotencyKey: 'unique-key-123',
      amountCents: 5000,
    });
    
    // First call
    const firstResult = await service.createExpense(input);
    expect(firstResult.success).toBe(true);
    
    // Second call with same key
    const secondResult = await service.createExpense(input);
    
    // Should return same record, not create duplicate
    expect(secondResult.success).toBe(true);
    expect(secondResult.record!.id).toBe(firstResult.record!.id);
    
    // Should not create new ledger entry
    const ledgerEntries = await ledgerRepo.findByRecordId(firstResult.record!.id);
    expect(ledgerEntries).toHaveLength(1); // Still only 1 entry
  });

  it('REQ-032: should create new entry for different idempotency key', async () => {
    const account = makeAccount({ id: 'account-1' });
    await accountRepo.create(account);

    const first = makeExpenseInput({ idempotencyKey: 'key-1', amountCents: 5000 });
    const second = makeExpenseInput({ idempotencyKey: 'key-2', amountCents: 5000 });
    
    const firstResult = await service.createExpense(first);
    const secondResult = await service.createExpense(second);
    
    expect(firstResult.record!.id).not.toBe(secondResult.record!.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 3: Duplicate candidate goes to review (REQ-006)
// ─────────────────────────────────────────────────────────────────────────────

describe('FinancialRecordService - Duplicate Detection', () => {
  let service: FinancialRecordService;
  let accountRepo: InMemoryAccountRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let idempotencyRepo: InMemoryIdempotencyRepository;

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    idempotencyRepo = new InMemoryIdempotencyRepository();
    service = new FinancialRecordService({
      accountRepository: accountRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      idempotencyRepository: idempotencyRepo,
    });
  });

  it('REQ-006 RED: should detect duplicate candidate and require review', async () => {
    const account = makeAccount({ id: 'account-1' });
    await accountRepo.create(account);

    // Create first expense
    const first = makeExpenseInput({ 
      amountCents: 10000,
      description: 'supermercado', // lowercase for exact match
    });
    const firstResult = await service.createExpense(first);
    expect(firstResult.success).toBe(true);

    // Try duplicate within 5 minutes - same amount, same description
    const duplicate = makeExpenseInput({ 
      amountCents: 10000,
      description: 'supermercado', // exact match
    });
    const dupResult = await service.createExpense(duplicate);

    // Should require review, not create posted record
    expect(dupResult.needsReview).toBe(true);
    expect(dupResult.record?.status).toBe('review');
    
    // Record should exist with review status
    const reviewRecords = await recordRepo.findByHouseholdId('household-1');
    const reviewRecord = reviewRecords.find(r => r.id === dupResult.record!.id && r.status === 'review');
    expect(reviewRecord).toBeDefined();
  });

  it('REQ-006: should allow different amounts through', async () => {
    const account = makeAccount({ id: 'account-1' });
    await accountRepo.create(account);

    await service.createExpense(makeExpenseInput({ amountCents: 10000 }));
    
    // Different amount - should go through
    const result = await service.createExpense(makeExpenseInput({ amountCents: 15000 }));
    expect(result.needsReview).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 4: TED anti-lie - service returns success=false on failure
// ─────────────────────────────────────────────────────────────────────────────

describe('FinancialRecordService - Service Result Integrity (REQ-005)', () => {
  let service: FinancialRecordService;
  let accountRepo: InMemoryAccountRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let idempotencyRepo: InMemoryIdempotencyRepository;

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    idempotencyRepo = new InMemoryIdempotencyRepository();
    service = new FinancialRecordService({
      accountRepository: accountRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      idempotencyRepository: idempotencyRepo,
    });
  });

  it('REQ-005: should return success=false when validation fails - no partial record', async () => {
    const input = makeExpenseInput({ accountId: 'non-existent' });
    const result = await service.createExpense(input);

    expect(result.success).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.record ?? null).toBeNull();
    
    // Verify no partial record was created
    const records = await recordRepo.findByHouseholdId('household-1');
    expect(records).toHaveLength(0);
    
    // Verify no ledger entries
    const ledgerEntries = await ledgerRepo.findByHouseholdId('household-1');
    expect(ledgerEntries).toHaveLength(0);
  });

  it('REQ-005: should not claim completion without confirmed ledger entry', async () => {
    const account = makeAccount({ id: 'account-1' });
    await accountRepo.create(account);

    const input = makeExpenseInput({ amountCents: 5000 });
    const result = await service.createExpense(input);

    if (result.success) {
      // If record created, ledger must exist
      const ledgerEntries = await ledgerRepo.findByRecordId(result.record!.id);
      expect(ledgerEntries.length).toBeGreaterThan(0);
    } else {
      // If failed, record must be null
      expect(result.record).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// High-Value Review Integration
// ─────────────────────────────────────────────────────────────────────────────

import { InMemoryReviewQueueRepository } from './review-queue-repository.js';
import { ReviewService } from '../core/services/review-service.js';

describe('FinancialRecordService - High-Value Review Integration', () => {
  let service: FinancialRecordService;
  let accountRepo: InMemoryAccountRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let idempotencyRepo: InMemoryIdempotencyRepository;
  let reviewRepo: InMemoryReviewQueueRepository;
  let reviewService: ReviewService;

  const HIGH_VALUE_THRESHOLD = 50000; // R$500,00 in cents

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    recordRepo = new InMemoryFinancialRecordRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    auditRepo = new InMemoryAuditLogRepository();
    idempotencyRepo = new InMemoryIdempotencyRepository();
    reviewRepo = new InMemoryReviewQueueRepository();
    
    reviewService = new ReviewService({
      reviewQueueRepository: reviewRepo,
      recordRepository: recordRepo,
    });
    
    service = new FinancialRecordService({
      accountRepository: accountRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      idempotencyRepository: idempotencyRepo,
      reviewService,
      highValueThresholdCents: HIGH_VALUE_THRESHOLD,
    });
  });

  async function setupAccount(id = 'account-1') {
    const account = makeAccount({ id });
    await accountRepo.create(account);
    return account;
  }

  it('should submit expense above threshold for review', async () => {
    await setupAccount();
    
    // R$600 > R$500 threshold
    const result = await service.createExpense(
      makeExpenseInput({ amountCents: 60000 })
    );

    expect(result.success).toBe(true);
    expect(result.needsReview).toBe(true);
    expect(result.record?.status).toBe('review');
    expect(result.reason).toContain('Valor alto');
  });

  it('should post expense below threshold directly', async () => {
    await setupAccount();
    
    // R$100 < R$500 threshold
    const result = await service.createExpense(
      makeExpenseInput({ amountCents: 10000 })
    );

    expect(result.success).toBe(true);
    expect(result.needsReview).toBeUndefined();
    expect(result.record?.status).toBe('posted');
  });

  it('should create review queue entry for high-value expense', async () => {
    await setupAccount();
    
    const result = await service.createExpense(
      makeExpenseInput({ amountCents: 60000 })
    );

    const reviewEntries = await reviewRepo.findPending('household-1');
    expect(reviewEntries).toHaveLength(1);
    expect(reviewEntries[0].recordId).toBe(result.record?.id);
    expect(reviewEntries[0].reason).toBe('high_value');
  });

  it('should not create ledger entries for high-value expenses pending review', async () => {
    await setupAccount();
    
    const result = await service.createExpense(
      makeExpenseInput({ amountCents: 60000 })
    );

    // No ledger entry should be created for review transactions
    const ledgerEntries = await ledgerRepo.findByRecordId(result.record!.id);
    expect(ledgerEntries).toHaveLength(0);
  });

  it('should submit income above threshold for review', async () => {
    await setupAccount();
    
    const result = await service.createIncome({
      householdId: 'household-1',
      accountId: 'account-1',
      amountCents: 60000,
      description: 'Recebimento grande',
      date: new Date().toISOString(),
      source: 'dashboard',
    });

    expect(result.success).toBe(true);
    expect(result.needsReview).toBe(true);
    expect(result.record?.status).toBe('review');
  });

  it('should submit transfer above threshold for review', async () => {
    const fromAccount = await setupAccount('from-account');
    const toAccount = await setupAccount('to-account');
    
    const result = await service.createTransfer({
      householdId: 'household-1',
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      amountCents: 60000,
      description: 'Transferencia grande',
      date: new Date().toISOString(),
      source: 'dashboard',
    });

    expect(result.success).toBe(true);
    expect(result.needsReview).toBe(true);
    expect(result.record?.status).toBe('review');
  });

  it('should work without reviewService - expense posts directly', async () => {
    const serviceWithoutReview = new FinancialRecordService({
      accountRepository: accountRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      idempotencyRepository: idempotencyRepo,
      // No reviewService - should still work
    });

    await setupAccount();
    
    const result = await serviceWithoutReview.createExpense(
      makeExpenseInput({ amountCents: 100000 }) // R$1000 - above threshold but no review service
    );

    expect(result.success).toBe(true);
    expect(result.needsReview).toBeUndefined();
    expect(result.record?.status).toBe('posted');
  });

  it('should use custom threshold per household when provided', async () => {
    const serviceWithLowThreshold = new FinancialRecordService({
      accountRepository: accountRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      idempotencyRepository: idempotencyRepo,
      reviewService,
      highValueThresholdCents: 10000, // R$100 threshold
    });

    await setupAccount();
    
    // R$150 - above R$100 threshold but below default R$500
    const result = await serviceWithLowThreshold.createExpense(
      makeExpenseInput({ amountCents: 15000 })
    );

    expect(result.success).toBe(true);
    expect(result.needsReview).toBe(true);
    expect(result.record?.status).toBe('review');
  });
});