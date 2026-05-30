import type { ICategoryRepository } from '../repositories/category-repository.js';
import type { Category, CategoryKind } from '../entities/category.js';

// ─────────────────────────────────────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateCategoryInput {
  householdId: string;
  name: string;
  kind: CategoryKind;
  parentId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Result Type
// ─────────────────────────────────────────────────────────────────────────────

export interface FindOrCreateResult {
  category: Category;
  created: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category Service (REQ-019, REQ-020)
// ─────────────────────────────────────────────────────────────────────────────

export class CategoryService {
  constructor(private deps: {
    categoryRepository: ICategoryRepository;
  }) {}

  /**
   * Find or create category - REQ-020 inspects existing before creating
   * - Normalizes name
   * - Checks exact match
   * - Checks aliases
   * - Creates macro+subcategory if name contains ">"
   */
  async findOrCreateCategory(input: {
    householdId: string;
    name: string;
    kind: CategoryKind;
  }): Promise<FindOrCreateResult> {
    const normalized = this.normalizeName(input.name);

    // 1. Check exact match by normalized name
    const exact = await this.deps.categoryRepository.findByNormalizedName(
      input.householdId,
      normalized
    );
    if (exact) {
      return { category: exact, created: false };
    }

    // 2. Check aliases (case-insensitive)
    const byAlias = await this.deps.categoryRepository.findByAlias(
      input.householdId,
      input.name
    );
    if (byAlias) {
      return { category: byAlias, created: false };
    }

    // 3. Check for hierarchical name "Parent > Child"
    if (input.name.includes(' > ')) {
      return this.createWithHierarchy(input);
    }

    // 4. Create simple category
    const category = await this.createCategory({
      householdId: input.householdId,
      name: input.name,
      kind: input.kind,
    });
    return { category, created: true };
  }

  /**
   * Create a new category with normalized name
   */
  async createCategory(input: CreateCategoryInput): Promise<Category> {
    const now = new Date().toISOString();
    const category: Category = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      name: input.name,
      parentId: input.parentId ?? null,
      kind: input.kind,
      normalizedName: this.normalizeName(input.name),
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    return this.deps.categoryRepository.create(category);
  }

  /**
   * Create macro category + subcategory from "Parent > Child" name
   */
  private async createWithHierarchy(input: {
    householdId: string;
    name: string;
    kind: CategoryKind;
  }): Promise<FindOrCreateResult> {
    const [parentName, childName] = input.name.split(' > ').map(s => s.trim());

    // Find or create parent
    let parent = await this.deps.categoryRepository.findByNormalizedName(
      input.householdId,
      this.normalizeName(parentName)
    );
    if (!parent) {
      parent = await this.createCategory({
        householdId: input.householdId,
        name: parentName,
        kind: input.kind,
      });
    }

    // Create or find child
    let child = await this.deps.categoryRepository.findByNormalizedName(
      input.householdId,
      this.normalizeName(childName)
    );
    if (!child) {
      child = await this.createCategory({
        householdId: input.householdId,
        name: childName,
        kind: input.kind,
        parentId: parent.id,
      });
    }

    return { category: child, created: true };
  }

  /**
   * Normalize category name:
   * - lowercase
   * - remove accents
   * - collapse whitespace
   * - remove special characters
   */
  normalizeName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9\s]/g, '')     // remove special chars
      .replace(/\s+/g, ' ')           // collapse whitespace
      .trim();
  }
}