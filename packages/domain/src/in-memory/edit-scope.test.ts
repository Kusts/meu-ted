// ─────────────────────────────────────────────────────────────────────────────
// RecurrenceService edit-scope tests (REQ-018)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { InMemoryRecurrenceRepository } from './recurrence-repository.js';
import { InMemoryRecurrenceOccurrenceRepository } from './recurrence-occurrence-repository.js';
import { InMemoryFinancialRecordRepository } from './financial-record-repository.js';
import { InMemoryLedgerRepository } from './ledger-repository.js';
import { InMemoryAuditLogRepository } from './audit-log-repository.js';
import { InMemoryCreditCardRepository } from './credit-card-repository.js';
import { InMemoryInvoiceRepository } from './invoice-repository.js';
import { InMemoryInstallmentGroupRepository } from './installment-group-repository.js';
import { InMemoryBillRepository } from './bill-repository.js';
import { InMemoryAccountRepository } from './account-repository.js';
import { RecurrenceService } from '../core/services/recurrence-service.js';

function makeService() {
  const recurrenceRepo = new InMemoryRecurrenceRepository();
  const occurrenceRepo = new InMemoryRecurrenceOccurrenceRepository();
  const recordRepo = new InMemoryFinancialRecordRepository();
  const ledgerRepo = new InMemoryLedgerRepository();
  const auditRepo = new InMemoryAuditLogRepository();
  const billRepo = new InMemoryBillRepository();
  const cardRepo = new InMemoryCreditCardRepository();
  const invoiceRepo = new InMemoryInvoiceRepository();
  const installmentRepo = new InMemoryInstallmentGroupRepository();
  const accountRepo = new InMemoryAccountRepository();
  const service = new RecurrenceService({
    recurrenceRepository: recurrenceRepo,
    occurrenceRepository: occurrenceRepo,
    recordRepository: recordRepo,
    ledgerRepository: ledgerRepo,
    auditRepository: auditRepo,
    billRepository: billRepo,
    cardRepository: cardRepo,
    invoiceRepository: invoiceRepo,
    installmentGroupRepository: installmentRepo,
    accountRepository: accountRepo,
  });
  return { service, recurrenceRepo, occurrenceRepo };
}

describe('RecurrenceService - editOccurrenceScope (REQ-018)', () => {
  it('RED: edit-scope single only edits that occurrence', async () => {
    const { service, occurrenceRepo } = makeService();

    const create = await service.createRecurrence({
      householdId: 'house-1',
      description: 'Test',
      amountCents: 1000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const occs = (await occurrenceRepo.findByRecurrenceId(create.recurrence!.id))
      .sort((a, b) => new Date(a.occurrenceDate).getTime() - new Date(b.occurrenceDate).getTime());

    const result = await service.editOccurrenceScope({
      occurrenceId: occs[2].id,
      scope: 'single',
      updates: { amountCents: 2500, description: 'Single edit' },
    });

    expect(result.success).toBe(true);
    expect(result.editedCount).toBe(1);

    const after = (await occurrenceRepo.findByRecurrenceId(create.recurrence!.id))
      .sort((a, b) => new Date(a.occurrenceDate).getTime() - new Date(b.occurrenceDate).getTime());

    expect(after[0].amountCents).toBe(1000);
    expect(after[1].amountCents).toBe(1000);
    expect(after[2].amountCents).toBe(2500);
    expect(after[2].description).toBe('Single edit');
    expect(after[2].editedPolicy).toBe('single');
    expect(after[3].amountCents).toBe(1000);
  });

  it('edit-scope future edits this and all future occurrences', async () => {
    const { service, occurrenceRepo } = makeService();

    const create = await service.createRecurrence({
      householdId: 'house-1',
      description: 'Test',
      amountCents: 1000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const occs = (await occurrenceRepo.findByRecurrenceId(create.recurrence!.id))
      .sort((a, b) => new Date(a.occurrenceDate).getTime() - new Date(b.occurrenceDate).getTime());

    const result = await service.editOccurrenceScope({
      occurrenceId: occs[3].id,
      scope: 'future',
      updates: { amountCents: 3000 },
    });

    expect(result.success).toBe(true);
    expect(result.editedCount).toBeGreaterThan(1);

    const after = (await occurrenceRepo.findByRecurrenceId(create.recurrence!.id))
      .sort((a, b) => new Date(a.occurrenceDate).getTime() - new Date(b.occurrenceDate).getTime());

    // Before edit point: unchanged
    expect(after[0].amountCents).toBe(1000);
    expect(after[1].amountCents).toBe(1000);
    expect(after[2].amountCents).toBe(1000);

    // After edit point: changed
    for (let i = 3; i < after.length; i++) {
      expect(after[i].amountCents).toBe(3000);
      expect(after[i].editedPolicy).toBe('future');
    }
  });

  it('edit-scope all edits all occurrences AND recurrence base', async () => {
    const { service, recurrenceRepo, occurrenceRepo } = makeService();

    const create = await service.createRecurrence({
      householdId: 'house-1',
      description: 'Original',
      amountCents: 1000,
      period: 'monthly',
      targetType: 'payable_bill',
      firstDate: new Date('2026-06-01').toISOString(),
    });

    const recurrenceId = create.recurrence!.id;
    const occs = await occurrenceRepo.findByRecurrenceId(recurrenceId);

    const result = await service.editOccurrenceScope({
      occurrenceId: occs[0].id,
      scope: 'all',
      updates: { amountCents: 1500, description: 'All edited' },
    });

    expect(result.success).toBe(true);
    expect(result.editedCount).toBe(occs.length);

    // Recurrence base should be updated
    const recurrence = await recurrenceRepo.findById(recurrenceId);
    expect(recurrence!.amountCents).toBe(1500);
    expect(recurrence!.description).toBe('All edited');

    // All occurrences should be updated
    const after = await occurrenceRepo.findByRecurrenceId(recurrenceId);
    for (const occ of after) {
      expect(occ.amountCents).toBe(1500);
      expect(occ.description).toBe('All edited');
      expect(occ.editedPolicy).toBe('all');
    }
  });

  it('edit-scope returns failure for non-existent occurrence', async () => {
    const { service } = makeService();

    const result = await service.editOccurrenceScope({
      occurrenceId: 'non-existent',
      scope: 'single',
      updates: { amountCents: 100 },
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBeDefined();
  });
});
