import { describe, it, expect } from 'vitest';
import {
  calculateAccountBalance,
  createTransferLedgerEntries,
} from '@pi-financeiro/domain';

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 1: Account balance can go negative (REQ-010)
// RED FIRST: This test defines the behavior we expect
// ─────────────────────────────────────────────────────────────────────────────

describe('Account Balance with Ledger', () => {
  describe('calculateAccountBalance', () => {
    it('REqv-001: should calculate positive balance from credits', () => {
      const initialBalance = 0;
      const entries = [
        { direction: 'credit' as const, amountCents: 50000 },
        { direction: 'credit' as const, amountCents: 30000 },
      ];
      
      const balance = calculateAccountBalance(initialBalance, entries);
      
      expect(balance).toBe(80000); // 0 + 50000 + 30000
    });

    it('REQ-010 RED: should allow negative balance when debits exceed credits', () => {
      const initialBalance = 10000; // R$100,00
      const entries = [
        { direction: 'debit' as const, amountCents: 50000 },  // R$500,00 spent
        { direction: 'credit' as const, amountCents: 20000 }, // R$200,00 received
      ];
      
      // RED phase: We expect this to produce a NEGATIVE balance
      // Balance = initial + credits - debits = 10000 + 20000 - 50000 = -20000
      const balance = calculateAccountBalance(initialBalance, entries);
      
      expect(balance).toBeLessThan(0);
      expect(balance).toBe(-20000);
    });

    it('REQ-010: should allow negative balance from zero initial', () => {
      const initialBalance = 0;
      const entries = [
        { direction: 'debit' as const, amountCents: 150000 }, // Big expense
      ];
      
      const balance = calculateAccountBalance(initialBalance, entries);
      
      expect(balance).toBe(-150000);
    });

    it('should calculate balance with mixed entries', () => {
      const initialBalance = 50000; // R$500,00
      const entries = [
        { direction: 'debit' as const, amountCents: 30000 },  // R$300,00
        { direction: 'credit' as const, amountCents: 80000 }, // R$800,00
        { direction: 'debit' as const, amountCents: 20000 }, // R$200,00
      ];
      
      // Balance = 50000 + 80000 - 30000 - 20000 = 80000
      const balance = calculateAccountBalance(initialBalance, entries);
      
      expect(balance).toBe(80000);
    });

    it('should return initial balance with no entries', () => {
      const initialBalance = 25000;
      const entries: { direction: 'credit' | 'debit'; amountCents: number }[] = [];
      
      const balance = calculateAccountBalance(initialBalance, entries);
      
      expect(balance).toBe(25000);
    });

    it('should handle large amounts correctly', () => {
      const initialBalance = 1000000; // R$10.000,00
      const entries = [
        { direction: 'debit' as const, amountCents: 1500000 }, // R$15.000,00
        { direction: 'credit' as const, amountCents: 700000 }, // R$7.000,00
      ];
      
      // Balance = 1000000 + 700000 - 1500000 = 200000
      const balance = calculateAccountBalance(initialBalance, entries);
      
      expect(balance).toBe(200000);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 2: Transfer creates debit AND credit entries (REQ-034)
// RED FIRST: Transfer must create balanced double-entry
// ─────────────────────────────────────────────────────────────────────────────

describe('Transfer Ledger Entries', () => {
  describe('createTransferLedgerEntries', () => {
    it('REQ-034 RED: should create debit entry for source account', () => {
      const householdId = crypto.randomUUID();
      const recordId = crypto.randomUUID();
      const fromAccountId = crypto.randomUUID();
      const toAccountId = crypto.randomUUID();
      const amount = 100000; // R$1.000,00

      const result = createTransferLedgerEntries({
        householdId,
        recordId,
        fromAccountId,
        toAccountId,
        amountCents: amount,
        effectiveDate: new Date().toISOString(),
      });

      expect(result.fromEntry.direction).toBe('debit');
      expect(result.fromEntry.amountCents).toBe(amount);
      expect(result.fromEntry.accountId).toBe(fromAccountId);
    });

    it('REQ-034 RED: should create credit entry for destination account', () => {
      const householdId = crypto.randomUUID();
      const recordId = crypto.randomUUID();
      const fromAccountId = crypto.randomUUID();
      const toAccountId = crypto.randomUUID();
      const amount = 100000;

      const result = createTransferLedgerEntries({
        householdId,
        recordId,
        fromAccountId,
        toAccountId,
        amountCents: amount,
        effectiveDate: new Date().toISOString(),
      });

      expect(result.toEntry.direction).toBe('credit');
      expect(result.toEntry.amountCents).toBe(amount);
      expect(result.toEntry.accountId).toBe(toAccountId);
    });

    it('REQ-034: should create both entries with same amount', () => {
      const householdId = crypto.randomUUID();
      const recordId = crypto.randomUUID();
      const fromAccountId = crypto.randomUUID();
      const toAccountId = crypto.randomUUID();
      const amount = 50000;

      const result = createTransferLedgerEntries({
        householdId,
        recordId,
        fromAccountId,
        toAccountId,
        amountCents: amount,
        effectiveDate: new Date().toISOString(),
      });

      expect(result.fromEntry.amountCents).toBe(result.toEntry.amountCents);
      expect(result.fromEntry.amountCents).toBe(amount);
    });

    it('REQ-034: both entries should reference same record', () => {
      const recordId = crypto.randomUUID();

      const result = createTransferLedgerEntries({
        householdId: crypto.randomUUID(),
        recordId,
        fromAccountId: crypto.randomUUID(),
        toAccountId: crypto.randomUUID(),
        amountCents: 25000,
        effectiveDate: new Date().toISOString(),
      });

      expect(result.fromEntry.recordId).toBe(recordId);
      expect(result.toEntry.recordId).toBe(recordId);
    });

    it('REQ-034: entries should have transfer entry type by default', () => {
      const result = createTransferLedgerEntries({
        householdId: crypto.randomUUID(),
        recordId: crypto.randomUUID(),
        fromAccountId: crypto.randomUUID(),
        toAccountId: crypto.randomUUID(),
        amountCents: 10000,
        effectiveDate: new Date().toISOString(),
      });

      expect(result.fromEntry.entryType).toBe('transfer');
      expect(result.toEntry.entryType).toBe('transfer');
    });

    it('REQ-034: should allow custom entry type', () => {
      const result = createTransferLedgerEntries({
        householdId: crypto.randomUUID(),
        recordId: crypto.randomUUID(),
        fromAccountId: crypto.randomUUID(),
        toAccountId: crypto.randomUUID(),
        amountCents: 10000,
        effectiveDate: new Date().toISOString(),
        entryType: 'interest',
      });

      expect(result.fromEntry.entryType).toBe('interest');
      expect(result.toEntry.entryType).toBe('interest');
    });

    it('REQ-034: both entries should share household_id', () => {
      const householdId = crypto.randomUUID();

      const result = createTransferLedgerEntries({
        householdId,
        recordId: crypto.randomUUID(),
        fromAccountId: crypto.randomUUID(),
        toAccountId: crypto.randomUUID(),
        amountCents: 75000,
        effectiveDate: new Date().toISOString(),
      });

      expect(result.fromEntry.householdId).toBe(householdId);
      expect(result.toEntry.householdId).toBe(householdId);
    });

    it('REQ-034: entries should use same effective date', () => {
      const effectiveDate = '2026-05-29T10:00:00Z';

      const result = createTransferLedgerEntries({
        householdId: crypto.randomUUID(),
        recordId: crypto.randomUUID(),
        fromAccountId: crypto.randomUUID(),
        toAccountId: crypto.randomUUID(),
        amountCents: 30000,
        effectiveDate,
      });

      expect(result.fromEntry.effectiveDate).toBe(effectiveDate);
      expect(result.toEntry.effectiveDate).toBe(effectiveDate);
    });

    it('REQ-034: should return both entries as TransferLedgerEntries type', () => {
      const result = createTransferLedgerEntries({
        householdId: crypto.randomUUID(),
        recordId: crypto.randomUUID(),
        fromAccountId: crypto.randomUUID(),
        toAccountId: crypto.randomUUID(),
        amountCents: 5000,
        effectiveDate: new Date().toISOString(),
      });

      expect(result).toHaveProperty('fromEntry');
      expect(result).toHaveProperty('toEntry');
      expect(result.fromEntry).not.toHaveProperty('id'); // id is generated by DB
      expect(result.toEntry).not.toHaveProperty('id');
    });
  });
});