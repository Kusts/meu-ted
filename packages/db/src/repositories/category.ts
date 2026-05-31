// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Category Repository
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq } from 'drizzle-orm';
import type { Category, CategoryAlias, CategoryUpdate } from '@pi-financeiro/domain';
import type { ICategoryRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { categories, categoryAliases } from '../schema/index.js';
import { toDbCategory, fromDbCategory, toDbCategoryAlias, fromDbCategoryAlias } from '../mappers/category.js';

export class DrizzleCategoryRepository implements ICategoryRepository {
  constructor(private dbClient: DbClient) {}

  async create(category: Category): Promise<Category> {
    const dbRow = toDbCategory(category);
    const [inserted] = await this.dbClient.db.insert(categories).values(dbRow).returning();
    return fromDbCategory(inserted);
  }

  async findById(id: string): Promise<Category | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    return row ? fromDbCategory(row) : null;
  }

  async findByHouseholdId(householdId: string): Promise<Category[]> {
    const rows = await this.dbClient.db
      .select()
      .from(categories)
      .where(eq(categories.householdId, householdId));
    return rows.map(fromDbCategory);
  }

  async findByNormalizedName(householdId: string, normalizedName: string): Promise<Category | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(categories)
      .where(and(eq(categories.householdId, householdId), eq(categories.normalizedName, normalizedName)))
      .limit(1);
    return row ? fromDbCategory(row) : null;
  }

  async findByParentId(parentId: string): Promise<Category[]> {
    const rows = await this.dbClient.db
      .select()
      .from(categories)
      .where(eq(categories.parentId, parentId));
    return rows.map(fromDbCategory);
  }

  async update(id: string, update: CategoryUpdate): Promise<Category | null> {
    const updateData: Partial<typeof categories.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (update.name !== undefined) updateData.name = update.name;
    if (update.active !== undefined) updateData.active = update.active;
    if (update.parentId !== undefined) updateData.parentId = update.parentId;

    const [updated] = await this.dbClient.db
      .update(categories)
      .set(updateData)
      .where(eq(categories.id, id))
      .returning();
    
    return updated ? fromDbCategory(updated) : null;
  }

  // Aliases
  async createAlias(alias: CategoryAlias): Promise<CategoryAlias> {
    const dbRow = toDbCategoryAlias(alias);
    const [inserted] = await this.dbClient.db.insert(categoryAliases).values(dbRow).returning();
    return fromDbCategoryAlias(inserted);
  }

  async updateAlias(id: string, update: { categoryId: string }): Promise<CategoryAlias | null> {
    const [updated] = await this.dbClient.db
      .update(categoryAliases)
      .set({ categoryId: update.categoryId })
      .where(eq(categoryAliases.id, id))
      .returning();
    return updated ? fromDbCategoryAlias(updated) : null;
  }

  async findByAlias(householdId: string, aliasValue: string): Promise<Category | null> {
    const [aliasRow] = await this.dbClient.db
      .select()
      .from(categoryAliases)
      .where(and(eq(categoryAliases.householdId, householdId), eq(categoryAliases.alias, aliasValue)))
      .limit(1);
    
    if (!aliasRow) return null;
    
    return this.findById(aliasRow.categoryId);
  }

  async findAliasesByCategoryId(categoryId: string): Promise<CategoryAlias[]> {
    const rows = await this.dbClient.db
      .select()
      .from(categoryAliases)
      .where(eq(categoryAliases.categoryId, categoryId));
    return rows.map(fromDbCategoryAlias);
  }
}
