// ─────────────────────────────────────────────────────────────────────────────
// Ledger Test - Account balance calculation
// Tests for calculateAccountBalance from @pi-financeiro/domain
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test } from 'vitest';
import { calculateAccountBalance } from '@pi-financeiro/domain';

// Entry helper type
interface LedgerEntry {
  direction: 'credit' | 'debit';
  amountCents: number;
}

function makeEntry(amountCents: number, direction: 'credit' | 'debit'): LedgerEntry {
  return { direction, amountCents };
}

// ─────────────────────────────────────────────────────────────────────────────
// E1.1: Multiple entry types calculation
// ─────────────────────────────────────────────────────────────────────────────

describe('Ledger - Account Balance Calculation', () => {
  
  test('E1.1a: Cash entries calculate correctly', () => {
    const entries: LedgerEntry[] = [
      makeEntry(10000, 'credit'),      // +100.00
      makeEntry(3000, 'debit'),        // -30.00
    ];
    
    const balance = calculateAccountBalance(0, entries);
    expect(balance).toBe(7000); // 0 + 100 - 30 = 70.00
  });

  test('E1.1b: Card charges calculate correctly', () => {
    const entries: LedgerEntry[] = [
      makeEntry(5000, 'credit'), // +50.00
      makeEntry(2000, 'credit'), // +20.00
      makeEntry(3000, 'debit'),   // -30.00
    ];
    
    const balance = calculateAccountBalance(0, entries);
    expect(balance).toBe(4000); // 0 + 50 + 20 - 30 = 40.00
  });

  test('E1.1c: Transfer entries calculate correctly', () => {
    const entries: LedgerEntry[] = [
      makeEntry(5000, 'debit'),   // -50.00 (sent)
      makeEntry(5000, 'credit'),  // +50.00 (received)
    ];
    
    const balance = calculateAccountBalance(0, entries);
    expect(balance).toBe(0); // Net zero for equal transfers
  });

  test('E1.1d: Mixed entry types calculate correctly', () => {
    const entries: LedgerEntry[] = [
      makeEntry(2000, 'credit'),               // +20.00 cash in
      makeEntry(1500, 'debit'),                 // -15.00 card purchase
      makeEntry(3000, 'credit'),                // +30.00 cash in
    ];
    
    const balance = calculateAccountBalance(10000, entries); // 100.00 initial
    expect(balance).toBe(13500); // 100 + 20 - 15 + 30 = 135.00
  });

  test('E1.1e: Adjustment entries affect balance', () => {
    const entries: LedgerEntry[] = [
      makeEntry(1000, 'credit'), // +10.00
      makeEntry(500, 'debit'),   // -5.00
    ];
    
    const balance = calculateAccountBalance(0, entries);
    expect(balance).toBe(500); // 0 + 10 - 5 = 5.00
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E1.2: Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Ledger - Edge Cases', () => {
  
  test('E1.2a: Zero entries returns initial balance', () => {
    const balance = calculateAccountBalance(5000, []);
    expect(balance).toBe(5000);
  });

  test('E1.2b: Single entry calculates correctly', () => {
    const entries = [makeEntry(5000, 'credit')];
    const balance = calculateAccountBalance(0, entries);
    expect(balance).toBe(5000);
  });

  test('E1.2c: Many entries (stress test)', () => {
    const entries: LedgerEntry[] = [];
    for (let i = 0; i < 100; i++) {
      entries.push(makeEntry(100, i % 2 === 0 ? 'credit' : 'debit'));
    }
    
    const balance = calculateAccountBalance(0, entries);
    // 50 credits of 100 + 50 debits of 100 = 5000 - 5000 = 0
    expect(balance).toBe(0);
  });

  test('E1.2d: Very large amounts calculate correctly', () => {
    const entries: LedgerEntry[] = [
      makeEntry(100000000, 'credit'),  // +1,000,000.00
      makeEntry(50000000, 'debit'),    // -500,000.00
    ];
    
    const balance = calculateAccountBalance(0, entries);
    expect(balance).toBe(50000000); // 500,000.00
  });

  test('E1.2e: Only debits (negative balance possible)', () => {
    const entries: LedgerEntry[] = [
      makeEntry(3000, 'debit'),
      makeEntry(2000, 'debit'),
      makeEntry(1000, 'debit'),
    ];
    
    const balance = calculateAccountBalance(0, entries);
    expect(balance).toBe(-6000); // Negative balance from all debits
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E1.3: Initial balance scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('Ledger - Initial Balance Scenarios', () => {
  
  test('E1.3a: Positive initial balance', () => {
    const entries = [makeEntry(5000, 'credit')];
    const balance = calculateAccountBalance(10000, entries);
    expect(balance).toBe(15000);
  });

  test('E1.3b: Zero initial balance', () => {
    const entries = [makeEntry(5000, 'credit')];
    const balance = calculateAccountBalance(0, entries);
    expect(balance).toBe(5000);
  });

  test('E1.3c: Initial balance with only debits (goes negative)', () => {
    const entries = [makeEntry(2000, 'debit')];
    const balance = calculateAccountBalance(1000, entries);
    expect(balance).toBe(-1000); // 10.00 - 20.00 = -10.00
  });

  test('E1.3d: Initial balance with equal credits and debits', () => {
    const entries: LedgerEntry[] = [
      makeEntry(5000, 'credit'),
      makeEntry(5000, 'debit'),
    ];
    const balance = calculateAccountBalance(10000, entries);
    expect(balance).toBe(10000); // Initial unchanged
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E1.4: Complex scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('Ledger - Complex Scenarios', () => {
  
  test('E1.4a: Real-world monthly expenses scenario', () => {
    // Simulate a month of transactions
    const entries: LedgerEntry[] = [
      makeEntry(500000, 'credit'), // Salary: +5000.00
      makeEntry(1200, 'debit'),      // Rent: -12.00
      makeEntry(450, 'debit'),       // Utilities: -4.50
      makeEntry(800, 'debit'),       // Groceries: -8.00
      makeEntry(200, 'debit'),       // Transport: -2.00
      makeEntry(1500, 'credit'),     // Freelance: +15.00
      makeEntry(600, 'debit'),       // Entertainment: -6.00
    ];
    
    // Starting balance: 1000.00
    const balance = calculateAccountBalance(100000, entries);
    // Credits: 500000 + 1500 = 501500
    // Debits: 1200 + 450 + 800 + 200 + 600 = 3250
    // Balance = 100000 + 501500 - 3250 = 598250
    expect(balance).toBe(598250); // 5982.50
  });

  test('E1.4b: Credit card bill payment scenario', () => {
    // Initial balance on credit card is negative (debt)
    const entries: LedgerEntry[] = [
      makeEntry(3000, 'debit'),   // Purchases: -30.00
      makeEntry(1500, 'debit'),   // More purchases: -15.00
      makeEntry(4500, 'credit'),  // Payment: +45.00 (paid off)
    ];
    
    const balance = calculateAccountBalance(0, entries);
    expect(balance).toBe(0); // Paid off
  });

  test('E1.4c: Savings account growth', () => {
    const entries: LedgerEntry[] = [
      makeEntry(10000, 'credit'),  // Initial deposit: +100.00
      makeEntry(5000, 'credit'),   // Monthly savings: +50.00
      makeEntry(3000, 'credit'),   // Interest: +30.00
      makeEntry(2000, 'debit'),    // Withdrawal: -20.00
    ];
    
    const balance = calculateAccountBalance(0, entries);
    expect(balance).toBe(16000); // 160.00
  });
});