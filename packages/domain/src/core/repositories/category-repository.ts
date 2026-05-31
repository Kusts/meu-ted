import type { Category, CategoryAlias, CategoryUpdate } from '../entities/category.js';

/**
 * Category Repository Port
 * Handles categories and aliases (REQ-019 hierarchical categories, REQ-020)
 */
export interface ICategoryRepository {
  create(category: Category): Promise<Category>;
  findById(id: string): Promise<Category | null>;
  findByHouseholdId(householdId: string): Promise<Category[]>;
  findByNormalizedName(householdId: string, normalizedName: string): Promise<Category | null>;
  findByParentId(parentId: string): Promise<Category[]>;
  update(id: string, update: CategoryUpdate): Promise<Category | null>;
  
  // Aliases
  createAlias(alias: CategoryAlias): Promise<CategoryAlias>;
  updateAlias(id: string, update: { categoryId: string }): Promise<CategoryAlias | null>;
  findByAlias(householdId: string, alias: string): Promise<Category | null>;
  findAliasesByCategoryId(categoryId: string): Promise<CategoryAlias[]>;
}