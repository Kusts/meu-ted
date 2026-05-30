// ─────────────────────────────────────────────────────────────────────────────
// Review Service Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, beforeEach } from 'vitest';
import { ReviewService } from '../core/services/review-service.js';
import { InMemoryReviewQueueRepository } from './review-queue-repository.js';
import { InMemoryFinancialRecordRepository } from './financial-record-repository.js';

describe('ReviewService', () => {
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

  // ─────────────────────────────────────────────────────────────────────────
  // submitForReview Tests
  // ─────────────────────────────────────────────────────────────────────────

  test('submitForReview creates entry with pending status', async () => {
    const result = await service.submitForReview({
      householdId,
      reason: 'high_value',
      payload: { amountCents: 1000000, description: 'Test' },
    });

    expect(result.success).toBe(true);
    expect(result.entry).toBeDefined();
    expect(result.entry!.status).toBe('pending');
    expect(result.entry!.reason).toBe('high_value');
    expect(result.entry!.householdId).toBe(householdId);
  });

  test('submitForReview with recordId marks record as review', async () => {
    // Create a record first
    const record = await recordRepo.create({
      id: crypto.randomUUID(),
      householdId,
      type: 'expense',
      amountCents: 100000,
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

    const result = await service.submitForReview({
      householdId,
      recordId: record.id,
      reason: 'duplicate',
      payload: { recordId: record.id },
    });

    expect(result.success).toBe(true);
    expect(result.entry!.recordId).toBe(record.id);

    // Verify record status changed
    const updatedRecord = await recordRepo.findById(record.id);
    expect(updatedRecord!.status).toBe('review');
  });

  test('submitForReview without recordId does not update any record', async () => {
    const result = await service.submitForReview({
      householdId,
      reason: 'manual_review',
      payload: { note: 'Needs manual check' },
    });

    expect(result.success).toBe(true);
    expect(result.entry!.recordId).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // approve Tests
  // ─────────────────────────────────────────────────────────────────────────

  test('approve changes entry status to approved', async () => {
    const entry = await reviewRepo.create({
      householdId,
      reason: 'high_value',
      originalPayload: { amountCents: 500000 },
    });

    const userId = crypto.randomUUID();
    const result = await service.approve(entry.id, userId);

    expect(result.success).toBe(true);
    expect(result.entry!.status).toBe('approved');
    expect(result.entry!.reviewedByUserId).toBe(userId);
    expect(result.entry!.reviewedAt).not.toBeNull();
  });

  test('approve sets record to posted with confirmedAt', async () => {
    const record = await recordRepo.create({
      id: crypto.randomUUID(),
      householdId,
      type: 'expense',
      amountCents: 500000,
      date: new Date().toISOString(),
      description: 'High value',
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

    const entry = await reviewRepo.create({
      householdId,
      recordId: record.id,
      reason: 'high_value',
      originalPayload: {},
    });

    const userId = crypto.randomUUID();
    await service.approve(entry.id, userId);

    const updatedRecord = await recordRepo.findById(record.id);
    expect(updatedRecord!.status).toBe('posted');
    expect(updatedRecord!.confirmedAt).not.toBeNull();
  });

  test('approve of high_value entry confirms the record with confirmedAt', async () => {
    const record = await recordRepo.create({
      id: crypto.randomUUID(),
      householdId,
      type: 'expense',
      amountCents: 60000, // R$600 - above threshold
      date: new Date().toISOString(),
      description: 'High value expense',
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

    const entry = await reviewRepo.create({
      householdId,
      recordId: record.id,
      reason: 'high_value',
      originalPayload: { amountCents: 60000 },
    });

    const userId = crypto.randomUUID();
    const result = await service.approve(entry.id, userId);

    expect(result.success).toBe(true);
    expect(result.entry!.status).toBe('approved');

    const updatedRecord = await recordRepo.findById(record.id);
    expect(updatedRecord!.status).toBe('posted');
    expect(updatedRecord!.confirmedAt).toBeDefined();
  });

  test('reject of high_value entry with cancelRecord cancels the record', async () => {
    const record = await recordRepo.create({
      id: crypto.randomUUID(),
      householdId,
      type: 'expense',
      amountCents: 60000,
      date: new Date().toISOString(),
      description: 'High value to reject',
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

    const entry = await reviewRepo.create({
      householdId,
      recordId: record.id,
      reason: 'high_value',
      originalPayload: { amountCents: 60000 },
    });

    const userId = crypto.randomUUID();
    const result = await service.reject(entry.id, userId, true);

    expect(result.success).toBe(true);
    expect(result.entry!.status).toBe('rejected');

    const updatedRecord = await recordRepo.findById(record.id);
    expect(updatedRecord!.status).toBe('cancelled');
  });

  test('approve returns error for non-existent entry', async () => {
    const result = await service.approve('non-existent-id', crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.reason).toBe('Entry not found');
  });

  test('approve returns error for already approved entry', async () => {
    const entry = await reviewRepo.create({
      householdId,
      reason: 'high_value',
      originalPayload: {},
    });

    await service.approve(entry.id, crypto.randomUUID());
    const result = await service.approve(entry.id, crypto.randomUUID());

    expect(result.success).toBe(false);
    expect(result.reason).toContain('already');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // reject Tests
  // ─────────────────────────────────────────────────────────────────────────

  test('reject changes entry status to rejected', async () => {
    const entry = await reviewRepo.create({
      householdId,
      reason: 'duplicate',
      originalPayload: {},
    });

    const userId = crypto.randomUUID();
    const result = await service.reject(entry.id, userId);

    expect(result.success).toBe(true);
    expect(result.entry!.status).toBe('rejected');
  });

  test('reject with cancelRecord cancels associated record', async () => {
    const record = await recordRepo.create({
      id: crypto.randomUUID(),
      householdId,
      type: 'expense',
      amountCents: 100000,
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

    const entry = await reviewRepo.create({
      householdId,
      recordId: record.id,
      reason: 'duplicate',
      originalPayload: {},
    });

    await service.reject(entry.id, crypto.randomUUID(), true);

    const updatedRecord = await recordRepo.findById(record.id);
    expect(updatedRecord!.status).toBe('cancelled');
  });

  test('reject without cancelRecord does not change record status', async () => {
    const record = await recordRepo.create({
      id: crypto.randomUUID(),
      householdId,
      type: 'expense',
      amountCents: 100000,
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

    const entry = await reviewRepo.create({
      householdId,
      recordId: record.id,
      reason: 'duplicate',
      originalPayload: {},
    });

    await service.reject(entry.id, crypto.randomUUID(), false);

    const updatedRecord = await recordRepo.findById(record.id);
    expect(updatedRecord!.status).toBe('review');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // listPending Tests
  // ─────────────────────────────────────────────────────────────────────────

  test('listPending returns only pending entries', async () => {
    // Create multiple entries
    const entry1 = await reviewRepo.create({
      householdId,
      reason: 'high_value',
      originalPayload: {},
    });
    await reviewRepo.create({
      householdId,
      reason: 'duplicate',
      originalPayload: {},
    });
    await service.approve(entry1.id, crypto.randomUUID());

    const pending = await service.listPending(householdId);
    expect(pending).toHaveLength(1);
    expect(pending[0].reason).toBe('duplicate');
  });

  test('pendingCount returns correct count', async () => {
    await reviewRepo.create({
      householdId,
      reason: 'high_value',
      originalPayload: {},
    });
    await reviewRepo.create({
      householdId,
      reason: 'duplicate',
      originalPayload: {},
    });

    const count = await service.pendingCount(householdId);
    expect(count).toBe(2);
  });
});
