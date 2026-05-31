import type { ICategoryRepository } from '../repositories/category-repository.js';
import type { Category, CategoryKind } from '../entities/category.js';

// ─────────────────────────────────────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────────────────────────────────────

import type { IFinancialRecordRepository } from '../repositories/financial-record-repository.js';


export interface CreateCategoryInput {
  householdId: string;
  name: string;
  kind: CategoryKind;
  parentId?: string;
}

export interface MergeCategoryInput {
  householdId: string;
  sourceCategoryId: string;
  targetCategoryId: string;
}

export interface MergeCategoryResult {
  success: boolean;
  movedRecords: number;
  movedAliases: number;
  movedRules: number;
  reason?: string;
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
    recordRepository?: IFinancialRecordRepository;
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
   * Merge source category into target (REQ-019/020):
   * - Move all financial records from source to target
   * - Move all aliases from source to target
   * - Deactivate source category
   * - Create alias: source.name → target
   */
  async mergeCategory(input: MergeCategoryInput): Promise<MergeCategoryResult> {
    const source = await this.deps.categoryRepository.findById(input.sourceCategoryId);
    if (!source) {
      return { success: false, movedRecords: 0, movedAliases: 0, movedRules: 0, reason: 'Categoria source não encontrada' };
    }
    if (source.householdId !== input.householdId) {
      return { success: false, movedRecords: 0, movedAliases: 0, movedRules: 0, reason: 'Categoria pertence a household diferente' };
    }
    if (source.id === input.targetCategoryId) {
      return { success: false, movedRecords: 0, movedAliases: 0, movedRules: 0, reason: 'Source e target não podem ser iguais' };
    }

    const target = await this.deps.categoryRepository.findById(input.targetCategoryId);
    if (!target) {
      return { success: false, movedRecords: 0, movedAliases: 0, movedRules: 0, reason: 'Categoria target não encontrada' };
    }
    if (target.householdId !== input.householdId) {
      return { success: false, movedRecords: 0, movedAliases: 0, movedRules: 0, reason: 'Categoria target pertence a household diferente' };
    }

    let movedRecords = 0;
    let movedAliases = 0;

    // Move all records from source to target
    if (this.deps.recordRepository) {
      const records = await this.deps.recordRepository.findByHouseholdId(input.householdId);
      for (const record of records) {
        if (record.categoryId === input.sourceCategoryId) {
          await this.deps.recordRepository.update(record.id, { categoryId: input.targetCategoryId });
          movedRecords++;
        }
      }
    }

    // Move all aliases from source to target
    const aliases = await this.deps.categoryRepository.findAliasesByCategoryId(input.sourceCategoryId);
    for (const alias of aliases) {
      await this.deps.categoryRepository.updateAlias(alias.id, { categoryId: input.targetCategoryId });
      movedAliases++;
    }

    // Deactivate source category
    await this.deps.categoryRepository.update(input.sourceCategoryId, { active: false });

    // Create automatic alias: source.name → target
    try {
      await this.deps.categoryRepository.createAlias({
        id: crypto.randomUUID(),
        householdId: input.householdId,
        categoryId: input.targetCategoryId,
        alias: source.name,
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Alias may already exist, ignore
    }

    return { success: true, movedRecords, movedAliases, movedRules: 0 };
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