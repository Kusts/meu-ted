// ─────────────────────────────────────────────────────────────────────────────
// PendingOperation Repository Tests
//
// Tests the IPendingOperationRepository contract via InMemoryPendingOperationRepository.
// DrizzlePendingOperationRepository follows the same interface.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryPendingOperationRepository } from '@pi-financeiro/domain';
import type { PendingOperation } from '@pi-financeiro/domain';

describe('InMemoryPendingOperationRepository', () => {
  let repo: InMemoryPendingOperationRepository;

  beforeEach(() => {
    repo = new InMemoryPendingOperationRepository();
  });

  function makeOp(overrides: Partial<PendingOperation> = {}): PendingOperation {
    const now = new Date().toISOString();
    const later = new Date(Date.now() + 3600 * 1000).toISOString();
    return {
      id: crypto.randomUUID(),
      householdId: 'h123',
      chatId: 'chat1',
      userPhone: '5511999999999',
      operationType: 'expense',
      draftPayload: { amountCents: 3590, description: 'carne' },
      missingFields: [],
      confirmationLevel: 1,
      idempotencyKey: null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt: later,
      ...overrides,
    };
  }

  it('create + find by id', async () => {
    const op = makeOp();
    const created = await repo.create(op);
    const found = await repo.findById(op.id);
    expect(found?.id).toBe(op.id);
    expect(found?.draftPayload.amountCents).toBe(3590);
  });

  it('find by chat returns pending non-expired', async () => {
    const op = makeOp({ chatId: 'chat-abc' });
    await repo.create(op);

    const found = await repo.findByChat('h123', 'chat-abc');
    expect(found).not.toBeNull();
    expect(found?.id).toBe(op.id);
  });

  it('expired operation is not returned by findByChat (now filtered in both Drizzle and in-memory)', async () => {
    // Both Drizzle and in-memory repo now filter by expiry in findByChat.
    const past = new Date(Date.now() - 5000).toISOString();
    const op = makeOp({ chatId: 'chat-old', expiresAt: past });
    await repo.create(op);

    const found = await repo.findByChat('h123', 'chat-old');
    expect(found).toBeNull(); // Expired, filtered out
  });

  it('update changes status', async () => {
    const op = makeOp();
    await repo.create(op);

    const updated = await repo.update(op.id, { status: 'confirmed' });
    expect(updated?.status).toBe('confirmed');
  });

  it('update can change draftPayload', async () => {
    const op = makeOp();
    await repo.create(op);

    const updated = await repo.update(op.id, {
      draftPayload: { ...op.draftPayload, description: 'updated desc' },
    });
    expect(updated?.draftPayload.description).toBe('updated desc');
  });

  it('findByIdempotencyKey returns matching operation', async () => {
    const op = makeOp({ idempotencyKey: 'idem-123' });
    await repo.create(op);

    const found = await repo.findByIdempotencyKey('h123', 'idem-123');
    expect(found).not.toBeNull();
    expect(found?.id).toBe(op.id);
  });

  it('findByIdempotencyKey returns null for non-existent key', async () => {
    const found = await repo.findByIdempotencyKey('h123', 'nonexistent');
    expect(found).toBeNull();
  });

  it('findByIdempotencyKey returns null for different household', async () => {
    const op = makeOp({ idempotencyKey: 'idem-house' });
    await repo.create(op);

    const found = await repo.findByIdempotencyKey('h999', 'idem-house');
    expect(found).toBeNull();
  });

  it('findExpiredBefore returns only expired pending ops', async () => {
    const past = new Date(Date.now() - 5000).toISOString();
    const future = new Date(Date.now() + 5000).toISOString();
    const expired = makeOp({ id: 'op-expired', expiresAt: past });
    const valid = makeOp({ id: 'op-valid', chatId: 'chat-valid', expiresAt: future });
    await repo.create(expired);
    await repo.create(valid);

    const now = new Date().toISOString();
    const found = await repo.findExpiredBefore(now);
    expect(found.some(op => op.id === 'op-expired')).toBe(true);
    expect(found.some(op => op.id === 'op-valid')).toBe(false);
  });

  it('delete removes operation', async () => {
    const op = makeOp();
    await repo.create(op);

    const deleted = await repo.delete(op.id);
    expect(deleted).toBe(true);

    const found = await repo.findById(op.id);
    expect(found).toBeNull();
  });

  it('delete returns false for non-existent id', async () => {
    const deleted = await repo.delete('does-not-exist');
    expect(deleted).toBe(false);
  });
});

describe('IPendingOperationRepository interface contract', () => {
  // Verify all required methods exist
  it('has all required methods', () => {
    const repo = new InMemoryPendingOperationRepository();
    const methods = [
      'create',
      'findById',
      'update',
      'delete',
      'findByChat',
      'findExpiredBefore',
      'findByIdempotencyKey',
    ] as const;

    for (const method of methods) {
      expect(typeof repo[method]).toBe('function');
    }
  });
});