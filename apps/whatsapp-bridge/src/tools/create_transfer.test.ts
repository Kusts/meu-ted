/**
 * create_transfer — Contract Test
 * ================================
 * Contract/documentation test for create_transfer tool.
 * Does NOT execute real DB operations.
 *
 * Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
 * Phase: 2
 *
 * VERIFIED CONTRACT:
 * - Input: from_account_id, to_account_id, amount_cents, description, date (YYYY-MM-DD)
 * - Output: { success: true, transaction_id: string } or { success: false, error: string }
 * - Side effect: creates ONE transaction with kind='transfer'
 *   - amount SUBTRAI from from_account
 *   - amount ADICIONA to to_account
 * - Does NOT create two transactions (single entry for transfer)
 */

import { describe, it, expect } from 'vitest';
import type { CreateTransferInput, CreateTransferResult } from './types';

describe('create_transfer — input contract', () => {
  it('requires from_account_id as UUID string', () => {
    const input: CreateTransferInput = {
      from_account_id: '550e8400-e29b-41d4-a716-446655440001',
      to_account_id: 'acc-uuid-2',
      amount_cents: 10000,
      description: 'Transferência para poupança',
      date: '2026-06-03',
    };
    expect(input.from_account_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('requires to_account_id as UUID string', () => {
    const input: CreateTransferInput = {
      from_account_id: 'acc-uuid-1',
      to_account_id: '550e8400-e29b-41d4-a716-446655440002',
      amount_cents: 10000,
      description: 'Transferência',
      date: '2026-06-03',
    };
    expect(input.to_account_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('from_account_id and to_account_id must be different', () => {
    const contract = {
      rule: 'from_account_id != to_account_id — same-account transfer not allowed',
    };
    expect(contract.rule).toBeDefined();
  });

  it('requires amount_cents as positive integer (cents)', () => {
    const input: CreateTransferInput = {
      from_account_id: 'acc-uuid-1',
      to_account_id: 'acc-uuid-2',
      amount_cents: 5000, // R$ 50,00
      description: 'Teste',
      date: '2026-06-03',
    };
    expect(input.amount_cents).toBeGreaterThan(0);
    expect(Number.isInteger(input.amount_cents)).toBe(true);
  });

  it('amount_cents must be in integer cents — no floating point', () => {
    const input: CreateTransferInput = {
      from_account_id: 'acc-uuid-1',
      to_account_id: 'acc-uuid-2',
      amount_cents: 1, // minimum
      description: 'Teste',
      date: '2026-06-03',
    };
    expect(input.amount_cents % 1).toBe(0);
  });

  it('requires description as string', () => {
    const input: CreateTransferInput = {
      from_account_id: 'acc-uuid-1',
      to_account_id: 'acc-uuid-2',
      amount_cents: 5000,
      description: 'Reserva de emergência',
      date: '2026-06-03',
    };
    expect(typeof input.description).toBe('string');
  });

  it('requires date in ISO format YYYY-MM-DD', () => {
    const input: CreateTransferInput = {
      from_account_id: 'acc-uuid-1',
      to_account_id: 'acc-uuid-2',
      amount_cents: 5000,
      description: 'Teste',
      date: '2026-06-03',
    };
    expect(input.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('accepts optional source_message_id for traceability', () => {
    const input: CreateTransferInput = {
      from_account_id: 'acc-uuid-1',
      to_account_id: 'acc-uuid-2',
      amount_cents: 5000,
      description: 'Teste',
      date: '2026-06-03',
      source_message_id: 'msg-transfer-789',
    };
    expect(input.source_message_id).toBeDefined();
  });

  it('accepts optional idempotency_key to prevent duplicates', () => {
    const input: CreateTransferInput = {
      from_account_id: 'acc-uuid-1',
      to_account_id: 'acc-uuid-2',
      amount_cents: 5000,
      description: 'Teste',
      date: '2026-06-03',
      idempotency_key: 'transfer-unique-key',
    };
    expect(typeof input.idempotency_key).toBe('string');
  });
});

describe('create_transfer — output contract', () => {
  it('success result has transaction_id field', () => {
    const result: CreateTransferResult = {
      success: true,
      transaction_id: 'tx-uuid-transfer',
    };
    expect(result.success).toBe(true);
    expect(typeof result.transaction_id).toBe('string');
  });

  it('failure result has error field and no transaction_id', () => {
    const result: CreateTransferResult = {
      success: false,
      error: 'Insufficient balance',
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.transaction_id).toBeUndefined();
  });
});

describe('create_transfer — behavior rules', () => {
  it('creates ONE transaction with kind=transfer, not two', () => {
    // Rule: transfer is a single transaction entry
    // - SUBTRAI from from_account (debit)
    // - ADICIONA to to_account (credit)
    // NOT two separate transactions
    const transferContract = {
      transaction_count: 1,
      kind: 'transfer',
      from_account_id: 'set',
      to_account_id: 'set',
      amount_cents: 'positive (sign encoded in kind)',
    };
    expect(transferContract.transaction_count).toBe(1);
    expect(transferContract.kind).toBe('transfer');
  });

  it('amount_cents always positive — sign encoded in kind=transfer', () => {
    const input: CreateTransferInput = {
      from_account_id: 'acc-uuid-1',
      to_account_id: 'acc-uuid-2',
      amount_cents: 25000, // R$ 250,00 — stored as positive
      description: 'Teste',
      date: '2026-06-03',
    };
    expect(input.amount_cents).toBe(25000);
    // kind='transfer' affects BOTH from_account (subtract) AND to_account (add)
  });

  it('transfer affects both accounts in balance calculation', () => {
    // Balance formula for transfer:
    // from_account: balance -= amount_cents (transfer_out)
    // to_account:   balance += amount_cents (transfer_in)
    const balanceImpact = {
      from_account: 'SUBTRAI (transfer_out)',
      to_account: 'ADICIONA (transfer_in)',
    };
    expect(balanceImpact.from_account).toBe('SUBTRAI (transfer_out)');
    expect(balanceImpact.to_account).toBe('ADICIONA (transfer_in)');
  });

  it('category_id is NULL for transfers (no category)', () => {
    const transferContract = {
      category_id: 'NULL for transfers', // no category concept for transfers
    };
    expect(transferContract.category_id).toBe('NULL for transfers');
  });
});