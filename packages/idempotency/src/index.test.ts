// ─────────────────────────────────────────────────────────────────────────────
// Idempotency Package Tests
// Covers: createWhatsAppIdempotencyKey, createRecurrenceIdempotencyKey,
//         createInvoiceCloseIdempotencyKey, createTransferIdempotencyKey,
//         IDEMPOTENCY_SCOPES, idempotency key format validation
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test } from 'vitest';
import {
  IDEMPOTENCY_SCOPES,
  createWhatsAppIdempotencyKey,
  createRecurrenceIdempotencyKey,
  createInvoiceCloseIdempotencyKey,
  createTransferIdempotencyKey,
} from './index.js';

describe('Idempotency Package', () => {

  // ─── IDEMPOTENCY_SCOPES ───────────────────────────────────────────────────

  describe('IDEMPOTENCY_SCOPES', () => {
    test('has all required scopes defined', () => {
      expect(IDEMPOTENCY_SCOPES.SOURCE_MESSAGE).toBe('source_message');
      expect(IDEMPOTENCY_SCOPES.WHATSAPP_MESSAGE).toBe('whatsapp_message');
      expect(IDEMPOTENCY_SCOPES.CRON_RECURRENCE).toBe('cron_recurrence');
      expect(IDEMPOTENCY_SCOPES.TOOL_EXECUTION).toBe('tool_execution');
      expect(IDEMPOTENCY_SCOPES.INVOICE_CLOSE).toBe('invoice_close');
      expect(IDEMPOTENCY_SCOPES.TRANSFER).toBe('transfer');
    });

    test('has exactly 6 scopes', () => {
      const keys = Object.keys(IDEMPOTENCY_SCOPES);
      expect(keys.length).toBe(6);
    });

    test('all values are strings', () => {
      Object.values(IDEMPOTENCY_SCOPES).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });

    test('scopes are non-empty strings', () => {
      Object.values(IDEMPOTENCY_SCOPES).forEach(value => {
        expect(value.length).toBeGreaterThan(0);
      });
    });
  });

  // ─── createWhatsAppIdempotencyKey ──────────────────────────────────────────

  describe('createWhatsAppIdempotencyKey', () => {
    test('generates key with whatsapp prefix', () => {
      const key = createWhatsAppIdempotencyKey('Evolution', 'msg-123');
      expect(key).toMatch(/^whatsapp_/);
    });

    test('includes provider in key', () => {
      const key = createWhatsAppIdempotencyKey('Evolution', 'msg-456');
      expect(key).toContain('Evolution');
    });

    test('includes message ID in key', () => {
      const key = createWhatsAppIdempotencyKey('Evolution', 'msg-789');
      expect(key).toContain('msg-789');
    });

    test('generates different keys for different messages', () => {
      const key1 = createWhatsAppIdempotencyKey('Evolution', 'msg-001');
      const key2 = createWhatsAppIdempotencyKey('Evolution', 'msg-002');
      expect(key1).not.toBe(key2);
    });

    test('generates same key for same input', () => {
      const key1 = createWhatsAppIdempotencyKey('E', 'id-1');
      const key2 = createWhatsAppIdempotencyKey('E', 'id-1');
      expect(key1).toBe(key2);
    });

    test('different providers generate different keys', () => {
      const key1 = createWhatsAppIdempotencyKey('Evolution', 'msg-123');
      const key2 = createWhatsAppIdempotencyKey('Twilio', 'msg-123');
      expect(key1).not.toBe(key2);
    });
  });

  // ─── createRecurrenceIdempotencyKey ────────────────────────────────────────

  describe('createRecurrenceIdempotencyKey', () => {
    test('generates key with recurrence prefix', () => {
      const key = createRecurrenceIdempotencyKey('rec-123', new Date('2024-01-15'));
      expect(key).toMatch(/^recurrence_/);
    });

    test('includes recurrence ID', () => {
      const key = createRecurrenceIdempotencyKey('rec-abc', new Date('2024-01-15'));
      expect(key).toContain('rec-abc');
    });

    test('includes date in YYYY-MM-DD format', () => {
      const key = createRecurrenceIdempotencyKey('rec-123', new Date('2024-03-20'));
      expect(key).toContain('2024-03-20');
    });

    test('same recurrence + same date = same key', () => {
      const d1 = new Date('2024-06-01T10:00:00Z');
      const d2 = new Date('2024-06-01T22:30:00Z');
      const key1 = createRecurrenceIdempotencyKey('rec-1', d1);
      const key2 = createRecurrenceIdempotencyKey('rec-1', d2);
      expect(key1).toBe(key2);
    });

    test('different recurrence IDs = different keys', () => {
      const date = new Date('2024-01-15');
      const key1 = createRecurrenceIdempotencyKey('rec-a', date);
      const key2 = createRecurrenceIdempotencyKey('rec-b', date);
      expect(key1).not.toBe(key2);
    });

    test('same recurrence + different dates = different keys', () => {
      const key1 = createRecurrenceIdempotencyKey('rec-1', new Date('2024-01-01'));
      const key2 = createRecurrenceIdempotencyKey('rec-1', new Date('2024-01-02'));
      expect(key1).not.toBe(key2);
    });
  });

  // ─── createInvoiceCloseIdempotencyKey ──────────────────────────────────────

  describe('createInvoiceCloseIdempotencyKey', () => {
    test('generates key with invoice_close prefix', () => {
      const key = createInvoiceCloseIdempotencyKey('card-1', 3, 2024);
      expect(key).toMatch(/^invoice_close_/);
    });

    test('includes card ID', () => {
      const key = createInvoiceCloseIdempotencyKey('mastercard-001', 5, 2024);
      expect(key).toContain('mastercard-001');
    });

    test('includes year', () => {
      const key = createInvoiceCloseIdempotencyKey('card-1', 6, 2024);
      expect(key).toContain('2024');
    });

    test('pads month with leading zero', () => {
      const key = createInvoiceCloseIdempotencyKey('card-1', 3, 2024);
      expect(key).toMatch(/^invoice_close_card-1_2024_03$/);
    });

    test('single-digit month is padded to two digits', () => {
      const key = createInvoiceCloseIdempotencyKey('card-1', 1, 2024);
      // Key format: invoice_close_card-1_2024_01
      const parts = key.split('_');
      const monthPart = parts[parts.length - 1];
      expect(monthPart.length).toBe(2);
      expect(monthPart.startsWith('0')).toBe(true);
    });

    test('double-digit month is not padded', () => {
      const key = createInvoiceCloseIdempotencyKey('card-1', 11, 2024);
      // Key format: invoice_close_card-1_2024_11
      const parts = key.split('_');
      const monthPart = parts[parts.length - 1];
      expect(monthPart).toBe('11');
    });

    test('same inputs produce same key', () => {
      const key1 = createInvoiceCloseIdempotencyKey('card-a', 4, 2024);
      const key2 = createInvoiceCloseIdempotencyKey('card-a', 4, 2024);
      expect(key1).toBe(key2);
    });

    test('different cards produce different keys', () => {
      const key1 = createInvoiceCloseIdempotencyKey('card-1', 6, 2024);
      const key2 = createInvoiceCloseIdempotencyKey('card-2', 6, 2024);
      expect(key1).not.toBe(key2);
    });

    test('different months produce different keys', () => {
      const key1 = createInvoiceCloseIdempotencyKey('card-1', 1, 2024);
      const key2 = createInvoiceCloseIdempotencyKey('card-1', 2, 2024);
      expect(key1).not.toBe(key2);
    });
  });

  // ─── createTransferIdempotencyKey ──────────────────────────────────────────

  describe('createTransferIdempotencyKey', () => {
    test('generates key with transfer prefix', () => {
      const key = createTransferIdempotencyKey('acc-1', 'acc-2', 1000, new Date('2024-01-15'));
      expect(key).toMatch(/^transfer_/);
    });

    test('includes from account', () => {
      const key = createTransferIdempotencyKey('checking', 'savings', 5000, new Date());
      expect(key).toContain('checking');
    });

    test('includes to account', () => {
      const key = createTransferIdempotencyKey('acc-a', 'acc-b', 5000, new Date());
      expect(key).toContain('acc-b');
    });

    test('includes amount in cents', () => {
      const key = createTransferIdempotencyKey('a', 'b', 15000, new Date());
      expect(key).toContain('15000');
    });

    test('includes date in YYYY-MM-DD format', () => {
      const key = createTransferIdempotencyKey('a', 'b', 1000, new Date('2024-07-04'));
      expect(key).toContain('2024-07-04');
    });

    test('same inputs produce same key', () => {
      const d = new Date('2024-03-15');
      const key1 = createTransferIdempotencyKey('x', 'y', 999, d);
      const key2 = createTransferIdempotencyKey('x', 'y', 999, d);
      expect(key1).toBe(key2);
    });

    test('different amounts produce different keys', () => {
      const d = new Date();
      const key1 = createTransferIdempotencyKey('a', 'b', 100, d);
      const key2 = createTransferIdempotencyKey('a', 'b', 200, d);
      expect(key1).not.toBe(key2);
    });

    test('reversed accounts produce different keys', () => {
      const d = new Date();
      const key1 = createTransferIdempotencyKey('acc-1', 'acc-2', 1000, d);
      const key2 = createTransferIdempotencyKey('acc-2', 'acc-1', 1000, d);
      expect(key1).not.toBe(key2);
    });
  });

  // ─── Key Format Validation ──────────────────────────────────────────────────

  describe('Key format patterns', () => {
    test('all generated keys are strings', () => {
      const keys = [
        createWhatsAppIdempotencyKey('p', 'm'),
        createRecurrenceIdempotencyKey('r', new Date()),
        createInvoiceCloseIdempotencyKey('c', 1, 2024),
        createTransferIdempotencyKey('a', 'b', 100, new Date()),
      ];
      keys.forEach(key => expect(typeof key).toBe('string'));
    });

    test('all generated keys are non-empty', () => {
      const keys = [
        createWhatsAppIdempotencyKey('p', 'm'),
        createRecurrenceIdempotencyKey('r', new Date()),
        createInvoiceCloseIdempotencyKey('c', 1, 2024),
        createTransferIdempotencyKey('a', 'b', 100, new Date()),
      ];
      keys.forEach(key => expect(key.length).toBeGreaterThan(0));
    });

    test('all keys use underscore as separator', () => {
      const key = createWhatsAppIdempotencyKey('provider', 'id');
      expect(key).toContain('_');
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    test('handles empty string IDs gracefully', () => {
      const key = createWhatsAppIdempotencyKey('', '');
      expect(key).toBe('whatsapp__');
    });

    test('handles special characters in IDs', () => {
      const key = createWhatsAppIdempotencyKey('prov-er', 'msg_with-dash');
      expect(key).toContain('prov-er');
      expect(key).toContain('msg_with-dash');
    });

    test('handles unicode in IDs', () => {
      const key = createWhatsAppIdempotencyKey('進化', 'メッセージ');
      expect(key).toContain('進化');
      expect(key).toContain('メッセージ');
    });

    test('handles very long amounts', () => {
      const key = createTransferIdempotencyKey('a', 'b', 999999999999, new Date());
      expect(key).toContain('999999999999');
    });
  });
});