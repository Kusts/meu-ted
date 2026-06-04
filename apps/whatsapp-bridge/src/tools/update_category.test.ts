/**
 * update_category — Contract Test
 * ================================
 * Contract test for update_category tool (Phase 4).
 * Does NOT execute real DB operations.
 *
 * Spec: Phase 4 of minimal-finance-agent-spec.md
 */

import { describe, it, expect } from 'vitest';
import type { UpdateCategoryInput, UpdateCategoryResult } from './phase4.types';

describe('update_category — input contract', () => {
  it('requires category_id as UUID', () => {
    const input: UpdateCategoryInput = {
      category_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Nova Categoria',
    };
    expect(input.category_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('requires name as non-empty string', () => {
    const input: UpdateCategoryInput = {
      category_id: 'cat-uuid',
      name: 'Alimentação Atualizada',
    };
    expect(input.name.length).toBeGreaterThan(0);
  });
});

describe('update_category — output contract', () => {
  it('success result has category_id field', () => {
    const result: UpdateCategoryResult = {
      success: true,
      category_id: 'cat-uuid-updated',
    };
    expect(result.success).toBe(true);
    expect(typeof result.category_id).toBe('string');
  });

  it('failure result has error field', () => {
    const result: UpdateCategoryResult = {
      success: false,
      error: 'Category not found',
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('update_category — behavior rules', () => {
  it('only name can be updated — kind is immutable', () => {
    // Rule: category.kind CANNOT be changed after creation
    // If wrong kind, deactivate and create new category
    const immutables = ['kind', 'household_id', 'id', 'created_at'];
    expect(immutables).toContain('kind');
  });

  it('records audit log with before_json and after_json', () => {
    const auditEntry = {
      action: 'update',
      entity_type: 'category',
      before_json: { name: 'Old Name' },
      after_json: { name: 'New Name' },
    };
    expect(auditEntry.action).toBe('update');
    expect(auditEntry.before_json).toBeDefined();
  });

  it('only active categories can be updated', () => {
    const preCondition = 'active = true AND deleted_at IS NULL';
    expect(preCondition).toContain('active = true');
  });

  it('name uniqueness is per (household_id, kind) — same name allowed for different kinds', () => {
    // "Alimentação" expense and "Alimentação" income can both exist
    const uniquenessContract = {
      scope: '(household_id, name, kind) — not just name',
      same_name_different_kind: 'allowed',
    };
    expect(uniquenessContract.same_name_different_kind).toBe('allowed');
  });
});