// ─────────────────────────────────────────────────────────────────────────────
// AutoCategorizationService Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, beforeEach } from 'vitest';
import { AutoCategorizationService, seedDefaultRules } from '../core/services/auto-categorization-service.js';
import { InMemoryCategorizationRuleRepository } from '../in-memory/categorization-rule-repository.js';
import { InMemoryCategoryRepository } from '../in-memory/category-repository.js';
import { CategoryService } from '../core/services/category-service.js';

describe('AutoCategorizationService', () => {
  let ruleRepo: InMemoryCategorizationRuleRepository;
  let categoryRepo: InMemoryCategoryRepository;
  let categoryService: CategoryService;
  let service: AutoCategorizationService;
  let householdId: string;
  let categoryId: string;

  beforeEach(async () => {
    ruleRepo = new InMemoryCategorizationRuleRepository();
    categoryRepo = new InMemoryCategoryRepository();
    categoryService = new CategoryService({ categoryRepository: categoryRepo });
    service = new AutoCategorizationService({
      ruleRepository: ruleRepo,
      categoryService,
    });

    householdId = crypto.randomUUID();
    
    // Create a test category
    const cat = await categoryService.createCategory({
      householdId,
      name: 'Alimentação',
      kind: 'expense',
    });
    categoryId = cat.id;
  });

  test('categorize returns null when no rules exist', async () => {
    const result = await service.categorize(householdId, 'compra no mercado');
    expect(result).toBeNull();
  });

  test('categorize returns categoryId when text matches', async () => {
    await ruleRepo.create({
      id: crypto.randomUUID(),
      householdId,
      matcher: 'mercado',
      matcherType: 'text',
      categoryId,
      priority: 0,
      active: true,
      createdAt: new Date().toISOString(),
    });

    const result = await service.categorize(householdId, 'compra no mercado');
    expect(result).toBe(categoryId);
  });

  test('categorize matches merchant name too', async () => {
    await ruleRepo.create({
      id: crypto.randomUUID(),
      householdId,
      matcher: 'mercado',
      matcherType: 'text',
      categoryId,
      priority: 0,
      active: true,
      createdAt: new Date().toISOString(),
    });

    const result = await service.categorize(householdId, 'pagamento', 'Super Mercado');
    expect(result).toBe(categoryId);
  });

  test('categorize is case insensitive', async () => {
    await ruleRepo.create({
      id: crypto.randomUUID(),
      householdId,
      matcher: 'MERCADO',
      matcherType: 'text',
      categoryId,
      priority: 0,
      active: true,
      createdAt: new Date().toISOString(),
    });

    const result = await service.categorize(householdId, 'compra no mercado');
    expect(result).toBe(categoryId);
  });

  test('categorize returns null when no match', async () => {
    await ruleRepo.create({
      id: crypto.randomUUID(),
      householdId,
      matcher: 'mercado',
      matcherType: 'text',
      categoryId,
      priority: 0,
      active: true,
      createdAt: new Date().toISOString(),
    });

    const result = await service.categorize(householdId, 'paguei uber');
    expect(result).toBeNull();
  });

  test('categorize respects priority - higher priority first', async () => {
    const cat2 = await categoryService.createCategory({
      householdId,
      name: 'Lazer',
      kind: 'expense',
    });

    await ruleRepo.create({
      id: crypto.randomUUID(),
      householdId,
      matcher: 'video',
      matcherType: 'text',
      categoryId,
      priority: 5,
      active: true,
      createdAt: new Date().toISOString(),
    });

    await ruleRepo.create({
      id: crypto.randomUUID(),
      householdId,
      matcher: 'video',
      matcherType: 'text',
      categoryId: cat2.id,
      priority: 10,
      active: true,
      createdAt: new Date().toISOString(),
    });

    const result = await service.categorize(householdId, 'assisti video game');
    expect(result).toBe(cat2.id);
  });

  test('categorize ignores inactive rules', async () => {
    await ruleRepo.create({
      id: crypto.randomUUID(),
      householdId,
      matcher: 'mercado',
      matcherType: 'text',
      categoryId,
      priority: 0,
      active: false, // inactive
      createdAt: new Date().toISOString(),
    });

    const result = await service.categorize(householdId, 'compra no mercado');
    expect(result).toBeNull();
  });

  test('categorize supports glob pattern', async () => {
    await ruleRepo.create({
      id: crypto.randomUUID(),
      householdId,
      matcher: '*mercado*',
      matcherType: 'glob',
      categoryId,
      priority: 0,
      active: true,
      createdAt: new Date().toISOString(),
    });

    const result = await service.categorize(householdId, 'no mercado central');
    expect(result).toBe(categoryId);
  });

  test('categorize supports regex pattern', async () => {
    await ruleRepo.create({
      id: crypto.randomUUID(),
      householdId,
      matcher: 'p\\d+',  // matches "p123"
      matcherType: 'regex',
      categoryId,
      priority: 0,
      active: true,
      createdAt: new Date().toISOString(),
    });

    const result = await service.categorize(householdId, 'pagamento p12345');
    expect(result).toBe(categoryId);
  });

  test('categorize returns first matching rule by priority', async () => {
    const cat2 = await categoryService.createCategory({
      householdId,
      name: 'Prioridade Alta',
      kind: 'expense',
    });

    // Create multiple rules, one higher priority
    await ruleRepo.create({
      id: crypto.randomUUID(),
      householdId,
      matcher: 'test',
      matcherType: 'text',
      categoryId,
      priority: 1,
      active: true,
      createdAt: new Date().toISOString(),
    });

    await ruleRepo.create({
      id: crypto.randomUUID(),
      householdId,
      matcher: 'test',
      matcherType: 'text',
      categoryId: cat2.id,
      priority: 2,  // higher
      active: true,
      createdAt: new Date().toISOString(),
    });

    const result = await service.categorize(householdId, 'this is a test');
    expect(result).toBe(cat2.id);
  });
});

describe('seedDefaultRules', () => {
  let ruleRepo: InMemoryCategorizationRuleRepository;
  let categoryRepo: InMemoryCategoryRepository;
  let categoryService: CategoryService;
  let householdId: string;

  beforeEach(async () => {
    ruleRepo = new InMemoryCategorizationRuleRepository();
    categoryRepo = new InMemoryCategoryRepository();
    categoryService = new CategoryService({ categoryRepository: categoryRepo });
    householdId = crypto.randomUUID();
  });

  test('creates rules for a household', async () => {
    const count = await seedDefaultRules(ruleRepo, categoryService, householdId);
    expect(count).toBeGreaterThan(0);
  });

  test('creates categories automatically', async () => {
    await seedDefaultRules(ruleRepo, categoryService, householdId);
    
    const categories = await categoryRepo.findAll();
    expect(categories.length).toBeGreaterThan(0);
  });

  test('rules are active by default', async () => {
    await seedDefaultRules(ruleRepo, categoryService, householdId);
    
    const rules = await ruleRepo.findActiveByHouseholdId(householdId);
    expect(rules.length).toBeGreaterThan(0);
  });

  test('creates income and expense categories', async () => {
    await seedDefaultRules(ruleRepo, categoryService, householdId);
    
    const categories = await categoryRepo.findAll();
    const kinds = new Set(categories.map(c => c.kind));
    expect(kinds.has('income')).toBe(true);
    expect(kinds.has('expense')).toBe(true);
  });
});