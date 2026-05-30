import type { CategorizationRule } from '../entities/categorization-rule.js';

// ─────────────────────────────────────────────────────────────────────────────
// CategorizationRule Repository Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ICategorizationRuleRepository {
  create(rule: CategorizationRule): Promise<CategorizationRule>;
  findById(id: string): Promise<CategorizationRule | null>;
  findActiveByHouseholdId(householdId: string): Promise<CategorizationRule[]>;
  delete(id: string): Promise<void>;
  deleteByHouseholdId(householdId: string): Promise<void>;
}