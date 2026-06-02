// ─────────────────────────────────────────────────────────────────────────────
// CLI Tests - Command parsing and execution
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseCreateExpenseArgs,
  createExpenseCommand,
} from '../commands/create-expense.js';
import {
  parseCreateIncomeArgs,
  createIncomeCommand,
} from '../commands/create-income.js';
import {
  parseCreateTransferArgs,
  createTransferCommand,
} from '../commands/create-transfer.js';

describe('CLI - Argument Parsing', () => {
  describe('create-expense', () => {
    it('parses all required arguments', () => {
      const args = parseCreateExpenseArgs([
        '--household', 'h123',
        '--account', 'a456',
        '--amount-cents', '3590',
        '--description', 'carne',
        '--date', '2026-06-02',
      ]);

      expect(args.household).toBe('h123');
      expect(args.account).toBe('a456');
      expect(args.amountCents).toBe(3590);
      expect(args.description).toBe('carne');
      expect(args.date).toBe('2026-06-02');
    });

    it('parses optional arguments', () => {
      const args = parseCreateExpenseArgs([
        '--household', 'h123',
        '--account', 'a456',
        '--amount-cents', '3590',
        '--description', 'carne',
        '--date', '2026-06-02',
        '--category', 'cat-food',
        '--source', 'whatsapp',
        '--idempotency-key', 'key-123',
        '--dry-run',
      ]);

      expect(args.category).toBe('cat-food');
      expect(args.source).toBe('whatsapp');
      expect(args.idempotencyKey).toBe('key-123');
      expect(args['dry-run']).toBe(true);
    });
  });

  describe('create-income', () => {
    it('parses all required arguments', () => {
      const args = parseCreateIncomeArgs([
        '--household', 'h123',
        '--account', 'a456',
        '--amount-cents', '500000',
        '--description', 'salário',
        '--date', '2026-06-01',
      ]);

      expect(args.household).toBe('h123');
      expect(args.account).toBe('a456');
      expect(args.amountCents).toBe(500000);
      expect(args.description).toBe('salário');
      expect(args.date).toBe('2026-06-01');
    });
  });

  describe('create-transfer', () => {
    it('parses all required arguments', () => {
      const args = parseCreateTransferArgs([
        '--household', 'h123',
        '--from-account', 'acc1',
        '--to-account', 'acc2',
        '--amount-cents', '10000',
        '--date', '2026-06-02',
      ]);

      expect(args.household).toBe('h123');
      expect(args.fromAccount).toBe('acc1');
      expect(args.toAccount).toBe('acc2');
      expect(args.amountCents).toBe(10000);
      expect(args.date).toBe('2026-06-02');
    });
  });
});

describe('CLI - Command Validation', () => {
  describe('create-expense validation', () => {
    it('returns error for missing household', async () => {
      const args = {
        household: '',
        account: 'acc1',
        amountCents: 3590,
        description: 'carne',
        date: '2026-06-02',
      };

      const result = await createExpenseCommand(args as any);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('--household');
    });

    it('returns error for missing account', async () => {
      const args = {
        household: 'h123',
        account: '',
        amountCents: 3590,
        description: 'carne',
        date: '2026-06-02',
      };

      const result = await createExpenseCommand(args as any);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('--account');
    });

    it('returns error for invalid amount', async () => {
      const args = {
        household: 'h123',
        account: 'acc1',
        amountCents: 0,
        description: 'carne',
        date: '2026-06-02',
      };

      const result = await createExpenseCommand(args as any);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('--amount-cents');
    });

    it('returns error for invalid date format', async () => {
      const args = {
        household: 'h123',
        account: 'acc1',
        amountCents: 3590,
        description: 'carne',
        date: '06-02-2026', // wrong format
      };

      const result = await createExpenseCommand(args as any);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('YYYY-MM-DD');
    });

    it('dry-run returns success without calling API', async () => {
      const args = {
        household: 'h123',
        account: 'acc1',
        amountCents: 3590,
        description: 'carne',
        date: '2026-06-02',
        'dry-run': true,
      };

      const result = await createExpenseCommand(args as any, true);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('validated', true);
    });
  });

  describe('create-income validation', () => {
    it('returns error for missing description', async () => {
      const args = {
        household: 'h123',
        account: 'acc1',
        amountCents: 5000,
        description: '',
        date: '2026-06-01',
      };

      const result = await createIncomeCommand(args as any);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('--description');
    });
  });

  describe('create-transfer validation', () => {
    it('returns error for missing from-account', async () => {
      const args = {
        household: 'h123',
        fromAccount: '',
        toAccount: 'acc2',
        amountCents: 10000,
        date: '2026-06-02',
      };

      const result = await createTransferCommand(args as any);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('--from-account');
    });

    it('returns error for missing to-account', async () => {
      const args = {
        household: 'h123',
        fromAccount: 'acc1',
        toAccount: '',
        amountCents: 10000,
        date: '2026-06-02',
      };

      const result = await createTransferCommand(args as any);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('--to-account');
    });
  });
});