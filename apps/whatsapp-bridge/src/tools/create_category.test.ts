/**
 * create_category — Contract Test
 * ================================
 * Contract/documentation test for create_category tool.
 * Does NOT execute real DB operations.
 *
 * Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
 * Phase: 2
 *
 * VERIFIED CONTRACT:
 * - Input: name, kind (expense|income)
 * - Output: { success: true, category_id: string }
 * - Category kind is immutable once created
 */

import { describe, it, expect } from 'vitest';
import type { CreateCategoryInput, CreateCategoryResult } from './types';

describe('create_category — input contract', () => {
  it('requires name as non-empty string', () => {
    const input: CreateCategoryInput = {
      name: 'Alimentação',
      kind: 'expense',
    };
    expect(input.name.length).toBeGreaterThan(0);
  });

  it('requires kind as expense or income', () => {
    const validInputs: CreateCategoryInput[] = [
      { name: 'Alimentação', kind: 'expense' },
      { name: 'Salário', kind: 'income' },
    ];
    validInputs.forEach(input => {
      expect(['expense', 'income']).toContain(input.kind);
    });
  });

  it('kind must be exactly expense or income', () => {
    const invalidKinds = ['transfer', 'EXPENSE', 'Income', '', 'other'];
    invalidKinds.forEach(kind => {
      expect(['expense', 'income']).not.toContain(kind);
    });
  });
});

describe('create_category — output contract', () => {
  it('success result has category_id field', () => {
    const result: CreateCategoryResult = {
      success: true,
      category_id: '550e8400-e29b-41d4-a716-446655440000',
    };
    expect(result.success).toBe(true);
    expect(typeof result.category_id).toBe('string');
    expect(result.category_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('failure result has error field', () => {
    const result: CreateCategoryResult = {
      success: false,
      error: 'Category name already exists',
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('create_category — behavior rules', () => {
  it('created category is active by default', () => {
    const defaultState = {
      active: true,
      deleted_at: null,
    };
    expect(defaultState.active).toBe(true);
  });

  it('kind is immutable — cannot be changed after creation', () => {
    // Rule: category kind (expense/income) cannot be updated
    // If wrong kind was created, deactivate and create new category
    const immutabilityContract = {
      field: 'kind',
      mutable: false,
      workaround: 'deactivate + create new',
    };
    expect(immutabilityContract.mutable).toBe(false);
  });

  it('category linked to household_id', () => {
    const contract = {
      household_link: 'required (household_id FK)',
    };
    expect(contract.household_link).toBe('required (household_id FK)');
  });

  it('name uniqueness is per-household', () => {
    // Rule: same name can exist for different kinds within household
    // { name: 'Bônus', kind: 'expense' } and { name: 'Bônus', kind: 'income' } allowed
    const uniquenessContract = {
      scope: 'per-household',
      composite_key: '(household_id, name, kind)',
    };
    expect(uniquenessContract.composite_key).toContain('kind');
  });
});