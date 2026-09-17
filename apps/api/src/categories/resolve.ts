/**
 * Central category resolver for writes (V4.1 Task 2.14, SPEC §9.8).
 *
 * Single pure rule shared by every store that validates a category on
 * write (transactions, cards, payables, budgets):
 *
 * - unknown id, other household, or inactive → 404 `not_found` ("Categoria");
 * - `expectedKind` mismatch → 400 `validation.invalid` on `categoryId`;
 * - no `expectedKind` → any active same-household category passes.
 *
 * In-memory stores call {@link resolveCategoryForWrite} directly against
 * their loaded category list. Postgres stores keep their single-row lookup
 * (no new DB queries) and delegate the kind decision to
 * {@link assertCategoryKind}, so both backends converge on the same rule.
 */

import { domainErrors } from '../writes/errors.js';
import type { CategoryKind } from '../types/domain.js';

/** Minimal category shape — satisfied by the domain `Category` type. */
export type CategoryLike = {
  id: string;
  householdId: string;
  kind: string;
  status: string;
};

export type ResolveCategoryOptions = {
  householdId: string;
  categoryId: string;
  /** When set, the resolved category must have this kind. */
  expectedKind?: CategoryKind;
  /** Error field for kind mismatches (default `categoryId`). */
  field?: string;
  /** Override for the kind-mismatch detail (e.g. the card-purchase message). */
  wrongKindMessage?: string;
};

const defaultWrongKindMessage = (expectedKind: CategoryKind): string =>
  expectedKind === 'income'
    ? 'lançamento de receita exige categoria de receita'
    : 'lançamento de despesa exige categoria de despesa';

/**
 * Enforces the expected kind on an already-loaded category row. Returns the
 * row unchanged when no `expectedKind` is given.
 */
export const assertCategoryKind = <T extends CategoryLike>(
  cat: T,
  expectedKind: CategoryKind | undefined,
  field = 'categoryId',
  wrongKindMessage?: string,
): T => {
  if (expectedKind !== undefined && cat.kind !== expectedKind) {
    throw domainErrors.invalid(field, wrongKindMessage ?? defaultWrongKindMessage(expectedKind));
  }
  return cat;
};

/**
 * Resolves a category id against an already-loaded list for a write in the
 * given household. Throws the shared 404/400 shapes on any mismatch.
 */
export const resolveCategoryForWrite = <T extends CategoryLike>(
  categories: readonly T[],
  opts: ResolveCategoryOptions,
): T => {
  const cat = categories.find(
    (c) => c.id === opts.categoryId && c.householdId === opts.householdId,
  );
  if (!cat || cat.status !== 'active') throw domainErrors.notFound('Categoria');
  return assertCategoryKind(cat, opts.expectedKind, opts.field ?? 'categoryId', opts.wrongKindMessage);
};

/** Card-purchase kind message preserved from the pre-centralization stores. */
export const CARD_EXPENSE_KIND_MESSAGE = 'compra no cartão exige categoria de despesa';
