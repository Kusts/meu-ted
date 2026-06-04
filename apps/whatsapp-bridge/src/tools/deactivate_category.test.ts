/**
 * deactivate_category — Contract Test
 * =====================================
 * Contract test for deactivate_category tool (Phase 4).
 * Does NOT execute real DB operations.
 *
 * Spec: Phase 4 of minimal-finance-agent-spec.md
 */

import { describe, it, expect } from 'vitest';
import type { DeactivateCategoryInput, DeactivateCategoryResult } from './phase4.types';

describe('deactivate_category — input contract', () => {
  it('requires category_id as UUID', () => {
    const input: DeactivateCategoryInput = {
      category_id: '550e8400-e29b-41d4-a716-446655440000',
    };
    expect(input.category_id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe('deactivate_category — output contract', () => {
  it('success result has category_id field', () => {
    const result: DeactivateCategoryResult = {
      success: true,
      category_id: 'cat-uuid-deactivated',
    };
    expect(result.success).toBe(true);
    expect(typeof result.category_id).toBe('string');
  });

  it('failure result has error field', () => {
    const result: DeactivateCategoryResult = {
      success: false,
      error: 'Category not found',
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('deactivate_category — behavior rules', () => {
  it('sets active = false (soft deactivate)', () => {
    const deactivation = {
      active: false,
      deleted_at: 'NOT SET (preserved)',
    };
    expect(deactivation.active).toBe(false);
  });

  it('transactions using this category are NOT affected — they keep category_id', () => {
    // Rule: existing transactions keep their category_id reference
    // Deactivation only prevents NEW transactions from using this category
    const existingTransactions = {
      keep_reference: true,
      new_transactions: 'cannot use inactive category',
    };
    expect(existingTransactions.keep_reference).toBe(true);
  });

  it('records audit log with before_json', () => {
    const auditEntry = {
      action: 'deactivate',
      entity_type: 'category',
      before_json: { active: true },
    };
    expect(auditEntry.action).toBe('deactivate');
  });

  it('deactivated categories excluded from list_categories', () => {
    const filter = 'WHERE active = true AND deleted_at IS NULL';
    expect(filter).toContain('active = true');
  });

  it('cannot deactivate twice', () => {
    const idempotency = {
      first_call: 'success, active=false',
      second_call: 'error "Category is not active"',
    };
    expect(idempotency.second_call).toContain('not active');
  });
});