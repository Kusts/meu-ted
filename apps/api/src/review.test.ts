// ─────────────────────────────────────────────────────────────────────────────
// Review API Routes Tests
// Tests the ReviewService and ReviewQueueRepository integration
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, beforeEach } from 'vitest';
import { ReviewService } from '@pi-financeiro/domain';
import { InMemoryReviewQueueRepository } from '@pi-financeiro/domain';
import { InMemoryFinancialRecordRepository } from '@pi-financeiro/domain';

describe('ReviewService API Integration', () => {
  let service: ReviewService;
  let reviewRepo: InMemoryReviewQueueRepository;
  let recordRepo: InMemoryFinancialRecordRepository;
  let householdId: string;

  beforeEach(() => {
    reviewRepo = new InMemoryReviewQueueRepository();
    recordRepo = new InMemoryFinancialRecordRepository();

    service = new ReviewService({
      reviewQueueRepository: reviewRepo,
      recordRepository: recordRepo,
    });

    householdId = crypto.randomUUID();
  });

  test('listPending returns empty array when no entries', async () => {
    const entries = await service.listPending(householdId);
    expect(entries).toHaveLength(0);
  });

  test('pendingCount returns 0 when no entries', async () => {
    const count = await service.pendingCount(householdId);
    expect(count).toBe(0);
  });

  test('submitForReview creates entry with all fields', async () => {
    const result = await service.submitForReview({
      householdId,
      reason: 'high_value',
      payload: { amountCents: 1000000 },
    });

    expect(result.success).toBe(true);
    expect(result.entry).toBeDefined();
    expect(result.entry!.householdId).toBe(householdId);
    expect(result.entry!.reason).toBe('high_value');
    expect(result.entry!.status).toBe('pending');
  });

  test('approve changes status to approved', async () => {
    const entry = await service.submitForReview({
      householdId,
      reason: 'duplicate',
      payload: {},
    });

    const result = await service.approve(entry.entry!.id, crypto.randomUUID());

    expect(result.success).toBe(true);
    expect(result.entry!.status).toBe('approved');
  });

  test('reject changes status to rejected', async () => {
    const entry = await service.submitForReview({
      householdId,
      reason: 'account_not_found',
      payload: {},
    });

    const result = await service.reject(entry.entry!.id, crypto.randomUUID());

    expect(result.success).toBe(true);
    expect(result.entry!.status).toBe('rejected');
  });

  test('approve with recordId confirms the record', async () => {
    // Create a record first
    const record = await recordRepo.create({
      id: crypto.randomUUID(),
      householdId,
      type: 'expense',
      amountCents: 500000,
      date: new Date().toISOString(),
      description: 'Test',
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      cardId: null,
      invoiceId: null,
      categoryId: null,
      createdByUserId: null,
      source: 'dashboard',
      sourceMessageId: null,
      idempotencyKey: null,
      status: 'review',
      recurrenceId: null,
      installmentGroupId: null,
      relatedRecordId: null,
      merchantId: null,
      confirmedAt: null,
      metadataJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const entry = await service.submitForReview({
      householdId,
      recordId: record.id,
      reason: 'high_value',
      payload: {},
    });

    await service.approve(entry.entry!.id, crypto.randomUUID());

    const updatedRecord = await recordRepo.findById(record.id);
    expect(updatedRecord!.status).toBe('posted');
    expect(updatedRecord!.confirmedAt).not.toBeNull();
  });

  test('reject with cancelRecord cancels the record', async () => {
    const record = await recordRepo.create({
      id: crypto.randomUUID(),
      householdId,
      type: 'expense',
      amountCents: 500000,
      date: new Date().toISOString(),
      description: 'Test',
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      cardId: null,
      invoiceId: null,
      categoryId: null,
      createdByUserId: null,
      source: 'dashboard',
      sourceMessageId: null,
      idempotencyKey: null,
      status: 'review',
      recurrenceId: null,
      installmentGroupId: null,
      relatedRecordId: null,
      merchantId: null,
      confirmedAt: null,
      metadataJson: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const entry = await service.submitForReview({
      householdId,
      recordId: record.id,
      reason: 'duplicate',
      payload: {},
    });

    await service.reject(entry.entry!.id, crypto.randomUUID(), true);

    const updatedRecord = await recordRepo.findById(record.id);
    expect(updatedRecord!.status).toBe('cancelled');
  });
});
