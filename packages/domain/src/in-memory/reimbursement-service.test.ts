// ─────────────────────────────────────────────────────────────────────────────
// Reimbursement Service Tests (REQ-029)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { ReimbursementService } from '../core/services/reimbursement-service.js';
import { InMemoryReimbursementRepository } from './reimbursement-repository.js';
import { InMemoryFinancialRecordRepository } from './financial-record-repository.js';
import { InMemoryLedgerRepository } from './ledger-repository.js';
import { InMemoryAuditLogRepository } from './audit-log-repository.js';

function makeService() {
  const reimbRepo = new InMemoryReimbursementRepository();
  const recordRepo = new InMemoryFinancialRecordRepository();
  const ledgerRepo = new InMemoryLedgerRepository();
  const auditRepo = new InMemoryAuditLogRepository();
  const service = new ReimbursementService({
    reimbursementRepository: reimbRepo,
    recordRepository: recordRepo,
    ledgerRepository: ledgerRepo,
    auditRepository: auditRepo,
  });
  return { service, reimbRepo, recordRepo, ledgerRepo };
}

describe('ReimbursementService', () => {
  describe('createReimbursement', () => {
    it('RED: creates pending reimbursement for expense', async () => {
      const { service, recordRepo } = makeService();

      // Create expense record
      await recordRepo.create({
        id: 'rec-1',
        householdId: 'house-1',
        type: 'expense',
        amountCents: 10000,
        date: new Date().toISOString(),
        description: 'Almoço de trabalho',
        accountId: null,
        fromAccountId: null,
        toAccountId: null,
        cardId: null,
        invoiceId: null,
        categoryId: null,
        createdByUserId: null,
        source: 'whatsapp',
        sourceMessageId: null,
        idempotencyKey: null,
        status: 'posted',
        recurrenceId: null,
        installmentGroupId: null,
        relatedRecordId: null,
        merchantId: null,
        confirmedAt: null,
        metadataJson: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await service.createReimbursement({
        householdId: 'house-1',
        originalRecordId: 'rec-1',
        amountCents: 5000,
        description: 'Reembolso almoço',
      });

      expect(result.success).toBe(true);
      expect(result.reimbursement).toBeDefined();
      expect(result.reimbursement!.amountCents).toBe(5000);
      expect(result.reimbursement!.status).toBe('partial');
    });

    it('createReimbursement fails for non-existent record', async () => {
      const { service } = makeService();

      const result = await service.createReimbursement({
        householdId: 'house-1',
        originalRecordId: 'non-existent',
        amountCents: 1000,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Registro original não encontrado');
    });

    it('createReimbursement fails for wrong household', async () => {
      const { service, recordRepo } = makeService();

      await recordRepo.create({
        id: 'rec-1',
        householdId: 'house-1',
        type: 'expense',
        amountCents: 10000,
        date: new Date().toISOString(),
        description: 'Test',
        accountId: null,
        fromAccountId: null,
        toAccountId: null,
        cardId: null,
        invoiceId: null,
        categoryId: null,
        createdByUserId: null,
        source: 'whatsapp',
        sourceMessageId: null,
        idempotencyKey: null,
        status: 'posted',
        recurrenceId: null,
        installmentGroupId: null,
        relatedRecordId: null,
        merchantId: null,
        confirmedAt: null,
        metadataJson: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await service.createReimbursement({
        householdId: 'house-2', // wrong household
        originalRecordId: 'rec-1',
        amountCents: 1000,
      });

      expect(result.success).toBe(false);
    });

    it('createReimbursement fails for income type', async () => {
      const { service, recordRepo } = makeService();

      await recordRepo.create({
        id: 'rec-1',
        householdId: 'house-1',
        type: 'income',
        amountCents: 10000,
        date: new Date().toISOString(),
        description: 'Test',
        accountId: null,
        fromAccountId: null,
        toAccountId: null,
        cardId: null,
        invoiceId: null,
        categoryId: null,
        createdByUserId: null,
        source: 'whatsapp',
        sourceMessageId: null,
        idempotencyKey: null,
        status: 'posted',
        recurrenceId: null,
        installmentGroupId: null,
        relatedRecordId: null,
        merchantId: null,
        confirmedAt: null,
        metadataJson: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await service.createReimbursement({
        householdId: 'house-1',
        originalRecordId: 'rec-1',
        amountCents: 1000,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Só pode reembolsar despesas');
    });
  });

  describe('completeReimbursement', () => {
    it('creates income record and ledger entry', async () => {
      const { service, reimbRepo, recordRepo, ledgerRepo } = makeService();

      // Create expense
      await recordRepo.create({
        id: 'rec-1',
        householdId: 'house-1',
        type: 'expense',
        amountCents: 10000,
        date: new Date().toISOString(),
        description: 'Almoço',
        accountId: 'account-1',
        fromAccountId: null,
        toAccountId: null,
        cardId: null,
        invoiceId: null,
        categoryId: null,
        createdByUserId: null,
        source: 'whatsapp',
        sourceMessageId: null,
        idempotencyKey: null,
        status: 'posted',
        recurrenceId: null,
        installmentGroupId: null,
        relatedRecordId: null,
        merchantId: null,
        confirmedAt: null,
        metadataJson: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Create reimbursement
      await reimbRepo.create({
        id: 'reimb-1',
        householdId: 'house-1',
        originalRecordId: 'rec-1',
        reimbursementRecordId: null,
        amountCents: 10000,
        status: 'pending',
        description: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await service.completeReimbursement({
        householdId: 'house-1',
        reimbursementId: 'reimb-1',
        accountId: 'account-1',
        date: new Date().toISOString(),
      });

      expect(result.success).toBe(true);
      expect(result.record).toBeDefined();
      expect(result.record!.type).toBe('income');
      expect(result.record!.amountCents).toBe(10000);
      expect(result.reimbursement!.status).toBe('completed');
      expect(result.reimbursement!.reimbursementRecordId).toBe(result.record!.id);

      // Check ledger entry
      const ledgerEntries = await ledgerRepo.findByRecordId(result.record!.id);
      expect(ledgerEntries).toHaveLength(1);
      expect(ledgerEntries[0].direction).toBe('credit');
    });

    it('completeReimbursement fails for non-existent reimbursement', async () => {
      const { service } = makeService();

      const result = await service.completeReimbursement({
        householdId: 'house-1',
        reimbursementId: 'non-existent',
        accountId: 'account-1',
        date: new Date().toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Reembolso não encontrado');
    });
  });

  describe('splitExpense', () => {
    it('stores splits in metadataJson', async () => {
      const { service, recordRepo } = makeService();

      await recordRepo.create({
        id: 'rec-1',
        householdId: 'house-1',
        type: 'expense',
        amountCents: 10000,
        date: new Date().toISOString(),
        description: 'Almoço',
        accountId: null,
        fromAccountId: null,
        toAccountId: null,
        cardId: null,
        invoiceId: null,
        categoryId: null,
        createdByUserId: null,
        source: 'whatsapp',
        sourceMessageId: null,
        idempotencyKey: null,
        status: 'posted',
        recurrenceId: null,
        installmentGroupId: null,
        relatedRecordId: null,
        merchantId: null,
        confirmedAt: null,
        metadataJson: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await service.splitExpense({
        householdId: 'house-1',
        recordId: 'rec-1',
        splits: [
          { userId: 'user-1', amountCents: 6000 },
          { userId: 'user-2', amountCents: 4000 },
        ],
      });

      expect(result.success).toBe(true);
      const metadata = JSON.parse(result.record!.metadataJson);
      expect(metadata.splits).toHaveLength(2);
      expect(metadata.splits[0].amountCents).toBe(6000);
      expect(metadata.splits[1].amountCents).toBe(4000);
    });

    it('splitExpense fails if splits do not match total', async () => {
      const { service, recordRepo } = makeService();

      await recordRepo.create({
        id: 'rec-1',
        householdId: 'house-1',
        type: 'expense',
        amountCents: 10000,
        date: new Date().toISOString(),
        description: 'Test',
        accountId: null,
        fromAccountId: null,
        toAccountId: null,
        cardId: null,
        invoiceId: null,
        categoryId: null,
        createdByUserId: null,
        source: 'whatsapp',
        sourceMessageId: null,
        idempotencyKey: null,
        status: 'posted',
        recurrenceId: null,
        installmentGroupId: null,
        relatedRecordId: null,
        merchantId: null,
        confirmedAt: null,
        metadataJson: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await service.splitExpense({
        householdId: 'house-1',
        recordId: 'rec-1',
        splits: [{ userId: 'user-1', amountCents: 5000 }], // only 5000, not 10000
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Soma dos splits');
    });
  });
});
