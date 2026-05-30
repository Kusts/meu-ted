import type { Category, CategoryAlias, CategoryUpdate } from '../core/entities/category.js';
import type { ICategoryRepository } from '../core/repositories/category-repository.js';

export class InMemoryCategoryRepository implements ICategoryRepository {
  private categories: Map<string, Category> = new Map();
  private aliases: Map<string, CategoryAlias> = new Map();

  async create(category: Category): Promise<Category> {
    this.categories.set(category.id, { ...category });
    return { ...category };
  }

  async findById(id: string): Promise<Category | null> {
    return this.categories.get(id) ?? null;
  }

  async findByHouseholdId(householdId: string): Promise<Category[]> {
    return Array.from(this.categories.values()).filter(
      c => c.householdId === householdId
    );
  }

  async findByNormalizedName(householdId: string, normalizedName: string): Promise<Category | null> {
    return Array.from(this.categories.values()).find(
      c => c.householdId === householdId && c.normalizedName === normalizedName
    ) ?? null;
  }

  async findByParentId(parentId: string): Promise<Category[]> {
    return Array.from(this.categories.values()).filter(
      c => c.parentId === parentId
    );
  }

  async update(id: string, update: CategoryUpdate): Promise<Category | null> {
    const existing = this.categories.get(id);
    if (!existing) return null;

    const updated: Category = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.categories.set(id, updated);
    return { ...updated };
  }

  // Aliases
  async createAlias(alias: CategoryAlias): Promise<CategoryAlias> {
    this.aliases.set(alias.id, { ...alias });
    return { ...alias };
  }

  async findByAlias(householdId: string, alias: string): Promise<Category | null> {
    const found = Array.from(this.aliases.values()).find(
      a => a.householdId === householdId && a.alias.toLowerCase() === alias.toLowerCase()
    );
    if (!found) return null;
    return this.categories.get(found.categoryId) ?? null;
  }

  async findAliasesByCategoryId(categoryId: string): Promise<CategoryAlias[]> {
    return Array.from(this.aliases.values()).filter(
      a => a.categoryId === categoryId
    );
  }

  async findAll(): Promise<Category[]> {
    return Array.from(this.categories.values());
  }
}