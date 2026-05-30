import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCategoryRepository } from './category-repository.js';
import { CategoryService, CreateCategoryInput } from '../core/services/category-service.js';
import type { CategoryKind } from '../core/entities/category.js';

// Factory helper
function makeCategory(overrides: Partial<{
  id: string;
  householdId: string;
  name: string;
  parentId: string | null;
  kind: CategoryKind;
  normalizedName: string;
  active: boolean;
}> = {}): ReturnType<typeof import('../core/entities/category.js')['Category']['parse']> {
  return {
    id: crypto.randomUUID(),
    householdId: 'household-1',
    name: 'Categoria',
    parentId: null,
    kind: 'expense' as CategoryKind,
    normalizedName: 'categoria',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario: Category normalization and alias reuse (REQ-019, REQ-020)
// RED FIRST: category service should normalize names and reuse existing
// ─────────────────────────────────────────────────────────────────────────────

describe('CategoryService', () => {
  let service: CategoryService;
  let repo: InMemoryCategoryRepository;

  beforeEach(() => {
    repo = new InMemoryCategoryRepository();
    service = new CategoryService({ categoryRepository: repo });
  });

  describe('findOrCreateCategory', () => {
    it('REQ-020 RED: should reuse existing category by normalized name', async () => {
      // Create macro category "Alimentação"
      const macro = makeCategory({
        name: 'Alimentação',
        normalizedName: 'alimentacao',
        kind: 'expense',
      });
      await repo.create(macro);

      // Try to find/create "alimentacao" again
      const result = await service.findOrCreateCategory({
        householdId: 'household-1',
        name: 'Alimentação', // same name
        kind: 'expense',
      });

      expect(result.created).toBe(false);
      expect(result.category.id).toBe(macro.id);
    });

    it('REQ-020: should reuse existing category by alias', async () => {
      const macro = makeCategory({
        name: 'Alimentação',
        normalizedName: 'alimentacao',
        kind: 'expense',
      });
      await repo.create(macro);

      // Create alias "Mercado"
      await repo.createAlias({
        id: crypto.randomUUID(),
        householdId: 'household-1',
        categoryId: macro.id,
        alias: 'Mercado',
        createdAt: new Date().toISOString(),
      });

      // Search for "mercado"
      const result = await service.findOrCreateCategory({
        householdId: 'household-1',
        name: 'Mercado', // alias
        kind: 'expense',
      });

      expect(result.created).toBe(false);
      expect(result.category.id).toBe(macro.id);
    });

    it('REQ-019: should create macro+subcategory when hierarchy needed', async () => {
      const result = await service.findOrCreateCategory({
        householdId: 'household-1',
        name: 'Alimentação > Mercado',
        kind: 'expense',
      });

      expect(result.created).toBe(true);
      expect(result.category.parentId).not.toBeNull();
      
      // Should have created both macro and subcategory
      const children = await repo.findByParentId(result.category.parentId!);
      expect(children.length).toBeGreaterThan(0);
    });

    it('should normalize names before lookup', async () => {
      const category = makeCategory({
        name: 'Transporte',
        normalizedName: 'transporte',
        kind: 'expense',
      });
      await repo.create(category);

      // Search with different case
      const result = await service.findOrCreateCategory({
        householdId: 'household-1',
        name: 'TRANSPORTE',
        kind: 'expense',
      });

      expect(result.created).toBe(false);
      expect(result.category.id).toBe(category.id);
    });
  });

  describe('createCategory', () => {
    it('should create category with normalized name', async () => {
      const input: CreateCategoryInput = {
        householdId: 'household-1',
        name: 'Lazer',
        kind: 'expense',
      };

      const result = await service.createCategory(input);

      expect(result.normalizedName).toBe('lazer');
      expect(result.active).toBe(true);
    });

    it('should handle special characters in normalization', async () => {
      const input: CreateCategoryInput = {
        householdId: 'household-1',
        name: 'A&B Construção',
        kind: 'expense',
      };

      const result = await service.createCategory(input);

      // Should normalize to alphanumeric only
      expect(result.normalizedName).toBe('ab construcao');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test for entity-level operations
// ─────────────────────────────────────────────────────────────────────────────

describe('InMemoryCategoryRepository', () => {
  let repo: InMemoryCategoryRepository;

  beforeEach(() => {
    repo = new InMemoryCategoryRepository();
  });

  it('should find categories by normalized name', async () => {
    const category = makeCategory({
      name: 'Mercado',
      normalizedName: 'mercado',
    });
    await repo.create(category);

    const found = await repo.findByNormalizedName('household-1', 'mercado');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Mercado');
  });

  it('should find categories by alias', async () => {
    const category = makeCategory({
      name: 'Alimentação',
      normalizedName: 'alimentacao',
    });
    await repo.create(category);

    await repo.createAlias({
      id: crypto.randomUUID(),
      householdId: 'household-1',
      categoryId: category.id,
      alias: 'Supermercado',
      createdAt: new Date().toISOString(),
    });

    const found = await repo.findByAlias('household-1', 'Supermercado');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Alimentação');
  });

  it('should find children by parentId', async () => {
    const macro = makeCategory({ name: 'Alimentação', normalizedName: 'alimentacao' });
    await repo.create(macro);

    const child = makeCategory({
      name: 'Mercado',
      parentId: macro.id,
      normalizedName: 'mercado',
    });
    await repo.create(child);

    const children = await repo.findByParentId(macro.id);
    expect(children).toHaveLength(1);
    expect(children[0].name).toBe('Mercado');
  });
});