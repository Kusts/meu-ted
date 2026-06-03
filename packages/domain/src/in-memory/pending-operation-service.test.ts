// ─────────────────────────────────────────────────────────────────────────────
// PendingOperationService Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import { PendingOperationService } from '../pending-operation-service.js';
import { InMemoryPendingOperationRepository } from './in-memory-pending-operation-repository.js';

describe('PendingOperationService', () => {
  let service: PendingOperationService;
  let repo: InMemoryPendingOperationRepository;

  beforeEach(() => {
    repo = new InMemoryPendingOperationRepository();
    service = new PendingOperationService(repo);
  });

  describe('create', () => {
    it('creates a pending expense operation', async () => {
      const result = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: {
          amountCents: 3590,
          description: 'carne',
          date: '2026-06-02',
          accountId: 'acc1',
        },
      });

      // result is PendingOperation — no .success field (this assertion validates the type contract)
      expect((result as unknown as Record<string, unknown>).success).toBeUndefined();
      expect(result).toMatchObject({
        householdId: 'h123',
        chatId: 'chat1',
        operationType: 'expense',
        status: 'pending',
      });
      expect(result.draftPayload.amountCents).toBe(3590);
      expect(result.missingFields).toEqual([]);
    });

    it('creates operation with missing fields', async () => {
      const result = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: {
          amountCents: 3590,
          // missing description, date, accountId
        },
      });

      expect(result.missingFields).toContain('description');
      expect(result.missingFields).toContain('date');
      expect(result.missingFields).toContain('accountId');
    });

    it('calculates confirmation level 0 for no amount', async () => {
      const result = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { description: 'test' },
      });

      expect(result.confirmationLevel).toBe(0);
    });

    it('calculates confirmation level 1 for normal amount', async () => {
      const result = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 10000 }, // R$100
      });

      expect(result.confirmationLevel).toBe(1);
    });

    it('calculates confirmation level 2 for high value (>R$500)', async () => {
      const result = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 70000 }, // R$700
      });

      expect(result.confirmationLevel).toBe(2);
    });

    it('uses idempotency key', async () => {
      const result = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 1000 },
        idempotencyKey: 'key-123',
      });

      expect(result.idempotencyKey).toBe('key-123');
    });

    it('returns existing operation for same idempotency key', async () => {
      const r1 = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 1000 },
        idempotencyKey: 'key-123',
      });

      const r2 = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 1000 },
        idempotencyKey: 'key-123',
      });

      expect(r1.id).toBe(r2.id);
    });
  });

  describe('appendField', () => {
    it('appends field to draft payload', async () => {
      const created = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 3590 },
      });

      const updated = await service.appendField(created.id, 'description', 'carne');

      expect(updated.draftPayload.description).toBe('carne');
    });

    it('recalculates missing fields after append', async () => {
      const created = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 3590 },
      });

      expect(created.missingFields).toContain('description');
      expect(created.missingFields).toContain('date');
      expect(created.missingFields).toContain('accountId');

      const afterDesc = await service.appendField(created.id, 'description', 'carne');
      expect(afterDesc.missingFields).not.toContain('description');
      expect(afterDesc.missingFields).toContain('date');
      expect(afterDesc.missingFields).toContain('accountId');
    });

    it('recalculates confirmation level when amount changes', async () => {
      const created = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 1000 },
      });

      expect(created.confirmationLevel).toBe(1);

      const updated = await service.appendField(created.id, 'amountCents', 70000);
      expect(updated.confirmationLevel).toBe(2);
    });

    it('throws for non-existent operation', async () => {
      await expect(service.appendField('non-existent', 'field', 'value')).rejects.toThrow('Operação não encontrada');
    });

    it('throws for confirmed operation', async () => {
      const created = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 1000 },
      });

      await service.confirm(created.id);
      await expect(service.appendField(created.id, 'description', 'test')).rejects.toThrow('não pode ser modificada');
    });
  });

  describe('confirm', () => {
    it('confirms pending operation', async () => {
      const created = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 3590 },
      });

      const confirmed = await service.confirm(created.id);

      expect(confirmed.status).toBe('confirmed');
    });

    it('throws for non-existent operation', async () => {
      await expect(service.confirm('non-existent')).rejects.toThrow('Operação não encontrada');
    });

    it('throws for already confirmed operation', async () => {
      const created = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 3590 },
      });

      await service.confirm(created.id);
      await expect(service.confirm(created.id)).rejects.toThrow('não pode ser confirmada');
    });
  });

  describe('cancel', () => {
    it('cancels pending operation', async () => {
      const created = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 3590 },
      });

      const cancelled = await service.cancel(created.id);

      expect(cancelled.status).toBe('cancelled');
    });

    it('throws for non-existent operation', async () => {
      await expect(service.cancel('non-existent')).rejects.toThrow('Operação não encontrada');
    });
  });

  describe('findPendingByChat', () => {
    it('finds pending operation by chat', async () => {
      const created = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 3590 },
      });

      const found = await service.findPendingByChat('h123', 'chat1');
      expect(found?.id).toBe(created.id);
    });

    it('returns null when no pending operation', async () => {
      const found = await service.findPendingByChat('h123', 'chat1');
      expect(found).toBeNull();
    });

    it('does not find cancelled operations', async () => {
      const created = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 3590 },
      });

      await service.cancel(created.id);
      const found = await service.findPendingByChat('h123', 'chat1');
      expect(found).toBeNull();
    });
  });

  describe('expireOld', () => {
    it('expires old pending operations', async () => {
      // Create operation with artificially old expiresAt
      const now = new Date();
      const oldDate = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago

      const op = await repo.create({
        id: crypto.randomUUID(),
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: { amountCents: 1000 },
        missingFields: [],
        confirmationLevel: 1,
        idempotencyKey: null,
        status: 'pending',
        createdAt: oldDate,
        updatedAt: oldDate,
        expiresAt: oldDate,
      });

      const count = await service.expireOld();
      expect(count).toBe(1);

      const expired = await repo.findById(op.id);
      expect(expired?.status).toBe('expired');
    });
  });

  describe('isReady', () => {
    it('returns true when no missing fields', () => {
      const operation = {
        missingFields: [],
      } as any;

      expect(service.isReady(operation)).toBe(true);
    });

    it('returns false when missing fields', () => {
      const operation = {
        missingFields: ['amountCents', 'description'],
      } as any;

      expect(service.isReady(operation)).toBe(false);
    });
  });

  describe('getMissingFieldPrompts', () => {
    it('returns prompts for each missing field', () => {
      const operation = {
        missingFields: ['amountCents', 'description', 'accountId'],
      } as any;

      const prompts = service.getMissingFieldPrompts(operation);
      expect(prompts).toContain('qual o valor?');
      expect(prompts).toContain('qual a descrição?');
      expect(prompts).toContain('qual a conta?');
    });
  });

  describe('operation types', () => {
    it('creates expense with missing fields', async () => {
      const result = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'expense',
        draftPayload: {},
      });

      expect(result.missingFields).toContain('amountCents');
      expect(result.missingFields).toContain('description');
      expect(result.missingFields).toContain('date');
      expect(result.missingFields).toContain('accountId');
    });

    it('creates transfer with missing fields', async () => {
      const result = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'transfer',
        draftPayload: {},
      });

      expect(result.missingFields).toContain('amountCents');
      expect(result.missingFields).toContain('date');
      expect(result.missingFields).toContain('fromAccountId');
      expect(result.missingFields).toContain('toAccountId');
    });

    it('creates card_purchase with missing fields', async () => {
      const result = await service.create({
        householdId: 'h123',
        chatId: 'chat1',
        userPhone: '+5511999999999',
        operationType: 'card_purchase',
        draftPayload: {},
      });

      expect(result.missingFields).toContain('amountCents');
      expect(result.missingFields).toContain('description');
      expect(result.missingFields).toContain('firstDate');
      expect(result.missingFields).toContain('cardId');
      expect(result.missingFields).toContain('installmentsCount');
    });
  });
});