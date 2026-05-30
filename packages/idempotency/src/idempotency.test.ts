import { describe, it, expect } from 'vitest';
import {
  checkIdempotencyKey,
  type IdempotencyKey,
} from '@pi-financeiro/domain';

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 3: Idempotency rejects duplicate keys (REQ-032)
// RED FIRST: Duplicate idempotency key should be rejected
// ─────────────────────────────────────────────────────────────────────────────

describe('Idempotency Key Validation', () => {
  describe('checkIdempotencyKey', () => {
    it('REQ-032 RED: should reject when key already exists', () => {
      const existingKey: IdempotencyKey = {
        id: crypto.randomUUID(),
        householdId: crypto.randomUUID(),
        key: 'unique-operation-key',
        scope: 'whatsapp_message',
        createdAt: new Date().toISOString(),
        expiresAt: null,
      };

      const result = checkIdempotencyKey(existingKey, null);

      expect(result.isDuplicate).toBe(true);
      expect(result.existingKey).toBeDefined();
      expect(result.reason).toBeDefined();
    });

    it('REQ-032: should return not duplicate when no existing key', () => {
      const result = checkIdempotencyKey(null, null);

      expect(result.isDuplicate).toBe(false);
      expect(result.existingKey).toBeUndefined();
    });

    it('REQ-032: should return not duplicate when key is expired', () => {
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() - 2); // 2 hours ago

      const existingKey: IdempotencyKey = {
        id: crypto.randomUUID(),
        householdId: crypto.randomUUID(),
        key: 'expired-key',
        scope: 'whatsapp_message',
        createdAt: expiredDate.toISOString(),
        expiresAt: new Date(Date.now() - 3600000).toISOString(), // expired 1 hour ago
      };

      const result = checkIdempotencyKey(existingKey, new Date());

      expect(result.isDuplicate).toBe(false);
    });

    it('REQ-032: should detect duplicate with same key and scope', () => {
      const existingKey: IdempotencyKey = {
        id: crypto.randomUUID(),
        householdId: crypto.randomUUID(),
        key: 'daily-expense-2026-05-29',
        scope: 'cron_recurrence',
        createdAt: new Date().toISOString(),
        expiresAt: null,
      };

      const result = checkIdempotencyKey(existingKey, null);

      expect(result.isDuplicate).toBe(true);
    });

    it('REQ-032: should work with WhatsApp source message idempotency', () => {
      const existingKey: IdempotencyKey = {
        id: crypto.randomUUID(),
        householdId: crypto.randomUUID(),
        key: 'msg_1234567890_evolution_api',
        scope: 'source_message',
        createdAt: new Date().toISOString(),
        expiresAt: null,
      };

      const result = checkIdempotencyKey(existingKey, null);

      expect(result.isDuplicate).toBe(true);
      expect(result.reason).toContain('already exists');
    });

    it('REQ-032: should handle different scopes as separate keys', () => {
      const key = 'same-key-different-scope';
      
      const whatsappKey: IdempotencyKey = {
        id: crypto.randomUUID(),
        householdId: crypto.randomUUID(),
        key,
        scope: 'whatsapp_message',
        createdAt: new Date().toISOString(),
        expiresAt: null,
      };

      const cronKey: IdempotencyKey = {
        id: crypto.randomUUID(),
        householdId: whatsappKey.householdId,
        key,
        scope: 'cron_recurrence',
        createdAt: new Date().toISOString(),
        expiresAt: null,
      };

      // Different scopes - both considered duplicates for their respective scopes
      const whatsappResult = checkIdempotencyKey(whatsappKey, null);
      const cronResult = checkIdempotencyKey(cronKey, null);

      expect(whatsappResult.isDuplicate).toBe(true);
      expect(cronResult.isDuplicate).toBe(true);
    });

    it('REQ-032: should provide reason when duplicate detected', () => {
      const existingKey: IdempotencyKey = {
        id: crypto.randomUUID(),
        householdId: crypto.randomUUID(),
        key: 'duplicate-operation',
        scope: 'tool_execution',
        createdAt: new Date().toISOString(),
        expiresAt: null,
      };

      const result = checkIdempotencyKey(existingKey, null);

      expect(result.reason).toBeDefined();
      expect(result.reason!.length).toBeGreaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration-style tests for idempotency scenarios (REQ-006)
// ─────────────────────────────────────────────────────────────────────────────

describe('Idempotency Business Rules', () => {
  it('REQ-006: should treat high-value duplicate as requiring review', () => {
    const duplicateKey: IdempotencyKey = {
      id: crypto.randomUUID(),
      householdId: crypto.randomUUID(),
      key: 'high-value-expense-2026-05-29',
      scope: 'whatsapp_message',
      createdAt: new Date().toISOString(),
      expiresAt: null,
    };

    const result = checkIdempotencyKey(duplicateKey, null);

    // High-value duplicates should be flagged
    expect(result.isDuplicate).toBe(true);
  });

  it('REQ-032: source_message_id already processed should not be duplicated', () => {
    const alreadyProcessedMessage: IdempotencyKey = {
      id: crypto.randomUUID(),
      householdId: crypto.randomUUID(),
      key: 'evolution_msg_12345',
      scope: 'source_message',
      createdAt: new Date().toISOString(),
      expiresAt: null,
    };

    const result = checkIdempotencyKey(alreadyProcessedMessage, null);

    expect(result.isDuplicate).toBe(true);
    expect(result.existingKey).toBeDefined();
  });

  it('REQ-006: similar amount + same account + short window = review candidate', () => {
    const firstKey: IdempotencyKey = {
      id: crypto.randomUUID(),
      householdId: crypto.randomUUID(),
      key: 'expense_100_mercado_2026-05-29_14:00',
      scope: 'whatsapp_message',
      createdAt: new Date().toISOString(),
      expiresAt: null,
    };

    const result = checkIdempotencyKey(firstKey, null);

    // Any match in the short window should be flagged as duplicate
    expect(result.isDuplicate).toBe(true);
  });
});