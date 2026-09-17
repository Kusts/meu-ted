/**
 * V4.1 PHASE 2 (Task 2.14, SPEC §9.8) — central category resolver contract.
 *
 * RED: `src/categories/resolve.ts` does not exist yet. Every store that
 * validates a category on write (transactions, cards, payables, budgets)
 * must converge on ONE pure rule:
 * - unknown id / other household / inactive → 404 `not_found` ("Categoria");
 * - `expectedKind` mismatch → 400 `validation.invalid` on `categoryId`;
 * - no `expectedKind` → any active same-household category passes.
 */

import { describe, expect, it } from 'vitest';
import {
  resolveCategoryForWrite,
  type CategoryLike,
} from '../../src/categories/resolve.js';
import { HOUSEHOLD_A, HOUSEHOLD_B } from '../fixtures/seed.js';

const EXPENSE_A: CategoryLike = {
  id: '22222222-2222-4222-8222-222222222221',
  householdId: HOUSEHOLD_A,
  kind: 'expense',
  status: 'active',
};

const INCOME_A: CategoryLike = {
  id: '22222222-2222-4222-8222-222222222223',
  householdId: HOUSEHOLD_A,
  kind: 'income',
  status: 'active',
};

const INACTIVE_A: CategoryLike = {
  id: '22222222-2222-4222-8222-222222222225',
  householdId: HOUSEHOLD_A,
  kind: 'expense',
  status: 'inactive',
};

const EXPENSE_B: CategoryLike = {
  ...EXPENSE_A,
  id: '22222222-2222-4222-8222-222222222224',
  householdId: HOUSEHOLD_B,
};

const CATEGORIES = [EXPENSE_A, INCOME_A, INACTIVE_A, EXPENSE_B];

const expectNotFoundCategoria = (fn: () => unknown): void => {
  try {
    fn();
  } catch (err) {
    const e = err as { statusCode?: number; code?: string; message?: string };
    expect(e.statusCode).toBe(404);
    expect(e.code).toBe('not_found');
    expect(e.message).toContain('Categoria');
    return;
  }
  expect.unreachable('expected a 404 Categoria error');
};

describe('resolveCategoryForWrite', () => {
  it('resolves an active same-household category', () => {
    const cat = resolveCategoryForWrite(CATEGORIES, {
      householdId: HOUSEHOLD_A,
      categoryId: EXPENSE_A.id,
      expectedKind: 'expense',
    });
    expect(cat.id).toBe(EXPENSE_A.id);
  });

  it('rejects an unknown category with 404', () => {
    expectNotFoundCategoria(() =>
      resolveCategoryForWrite(CATEGORIES, {
        householdId: HOUSEHOLD_A,
        categoryId: '00000000-0000-4000-8000-00000000ffff',
        expectedKind: 'expense',
      }),
    );
  });

  it('rejects a category from another household with 404', () => {
    expectNotFoundCategoria(() =>
      resolveCategoryForWrite(CATEGORIES, {
        householdId: HOUSEHOLD_A,
        categoryId: EXPENSE_B.id,
        expectedKind: 'expense',
      }),
    );
  });

  it('rejects an inactive category with 404', () => {
    expectNotFoundCategoria(() =>
      resolveCategoryForWrite(CATEGORIES, {
        householdId: HOUSEHOLD_A,
        categoryId: INACTIVE_A.id,
        expectedKind: 'expense',
      }),
    );
  });

  it('rejects a wrong-kind category with 400 on categoryId', () => {
    try {
      resolveCategoryForWrite(CATEGORIES, {
        householdId: HOUSEHOLD_A,
        categoryId: INCOME_A.id,
        expectedKind: 'expense',
      });
    } catch (err) {
      const e = err as { statusCode?: number; code?: string; message?: string };
      expect(e.statusCode).toBe(400);
      expect(e.code).toBe('validation.invalid');
      expect(e.message).toContain('categoryId');
      return;
    }
    expect.unreachable('expected a 400 categoryId error');
  });

  it('accepts any kind when no expectedKind is given', () => {
    expect(
      resolveCategoryForWrite(CATEGORIES, {
        householdId: HOUSEHOLD_A,
        categoryId: INCOME_A.id,
      }).id,
    ).toBe(INCOME_A.id);
  });

  it('preserves a caller-supplied wrong-kind message (card path)', () => {
    try {
      resolveCategoryForWrite(CATEGORIES, {
        householdId: HOUSEHOLD_A,
        categoryId: INCOME_A.id,
        expectedKind: 'expense',
        wrongKindMessage: 'compra no cartão exige categoria de despesa',
      });
    } catch (err) {
      expect((err as Error).message).toContain(
        'compra no cartão exige categoria de despesa',
      );
      return;
    }
    expect.unreachable('expected a 400 categoryId error');
  });
});
