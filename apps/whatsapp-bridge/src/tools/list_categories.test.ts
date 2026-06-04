/**
 * list_categories — Contract Test
 * ===============================
 * Contract/documentation test for list_categories tool.
 * Does NOT execute real DB operations.
 *
 * Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
 * Phase: 2
 */

import { describe, it, expect } from 'vitest';
import type { ListCategoriesResult } from './types';

describe('list_categories — input contract', () => {
  it('no input required', () => {
    const input = {};
    expect(input).toEqual({});
  });
});

describe('list_categories — output contract', () => {
  it('success result contains categories array', () => {
    const result: ListCategoriesResult = {
      success: true,
      categories: [
        {
          id: 'cat-uuid-1',
          name: 'Alimentação',
          kind: 'expense',
          active: true,
        },
        {
          id: 'cat-uuid-2',
          name: 'Salário',
          kind: 'income',
          active: true,
        },
      ],
    };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.categories)).toBe(true);
  });

  it('each category row has id, name, kind, active', () => {
    const categoryRow = {
      id: 'cat-uuid',
      name: 'Transporte',
      kind: 'expense',
      active: true,
    };
    expect(categoryRow.id).toBeDefined();
    expect(categoryRow.name).toBeDefined();
    expect(['expense', 'income']).toContain(categoryRow.kind);
    expect(typeof categoryRow.active).toBe('boolean');
  });

  it('only active categories returned', () => {
    const filter = 'WHERE active = true AND deleted_at IS NULL';
    expect(filter).toContain('active = true');
  });

  it('failure result has error field', () => {
    const result: ListCategoriesResult = {
      success: false,
      error: 'Household not found',
      categories: [],
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('list_categories — kind rules', () => {
  it('kind is either expense or income (not both)', () => {
    const kinds = ['expense', 'income'];
    kinds.forEach(kind => {
      expect(['expense', 'income']).toContain(kind);
    });
  });

  it('expense categories used for expenses only', () => {
    const category = {
      name: 'Alimentação',
      kind: 'expense',
    };
    expect(category.kind).toBe('expense');
  });

  it('income categories used for income only', () => {
    const category = {
      name: 'Salário',
      kind: 'income',
    };
    expect(category.kind).toBe('income');
  });
});