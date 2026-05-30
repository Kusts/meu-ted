// ─────────────────────────────────────────────────────────────────────────────
// Category Mapper - Domain Entity <-> Drizzle Row
// ─────────────────────────────────────────────────────────────────────────────

import type { Category, CategoryAlias } from '@pi-financeiro/domain';
import type { categories, categoryAliases } from '../schema/index.js';

type DbCategoryRow = typeof categories.$inferInsert;
type DbCategoryAliasRow = typeof categoryAliases.$inferInsert;

/**
 * Map domain Category entity to DB row format
 */
export function toDbCategory(category: Category): DbCategoryRow {
  return {
    id: category.id,
    householdId: category.householdId,
    name: category.name,
    parentId: category.parentId,
    kind: category.kind,
    normalizedName: category.normalizedName,
    active: category.active,
    createdAt: new Date(category.createdAt),
    updatedAt: new Date(category.updatedAt),
  };
}

/**
 * Map DB row to domain Category entity
 */
export function fromDbCategory(row: typeof categories.$inferSelect): Category {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    parentId: row.parentId,
    kind: row.kind,
    normalizedName: row.normalizedName,
    active: row.active,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

/**
 * Map domain CategoryAlias entity to DB row format
 */
export function toDbCategoryAlias(alias: CategoryAlias): DbCategoryAliasRow {
  return {
    id: alias.id,
    householdId: alias.householdId,
    categoryId: alias.categoryId,
    alias: alias.alias,
    createdAt: new Date(alias.createdAt),
  };
}

/**
 * Map DB row to domain CategoryAlias entity
 */
export function fromDbCategoryAlias(row: typeof categoryAliases.$inferSelect): CategoryAlias {
  return {
    id: row.id,
    householdId: row.householdId,
    categoryId: row.categoryId,
    alias: row.alias,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}
