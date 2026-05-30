// ─────────────────────────────────────────────────────────────────────────────
// In-Memory CategorizationRule Repository
// ─────────────────────────────────────────────────────────────────────────────

import type { CategorizationRule } from '../core/entities/categorization-rule.js';
import type { ICategorizationRuleRepository } from '../core/repositories/categorization-rule-repository.js';

export class InMemoryCategorizationRuleRepository implements ICategorizationRuleRepository {
  private rules = new Map<string, CategorizationRule>();

  async create(rule: CategorizationRule): Promise<CategorizationRule> {
    this.rules.set(rule.id, { ...rule });
    return { ...rule };
  }

  async findById(id: string): Promise<CategorizationRule | null> {
    return this.rules.get(id) ?? null;
  }

  async findActiveByHouseholdId(householdId: string): Promise<CategorizationRule[]> {
    return Array.from(this.rules.values())
      .filter(r => r.householdId === householdId && r.active)
      .sort((a, b) => b.priority - a.priority);
  }

  async delete(id: string): Promise<void> {
    this.rules.delete(id);
  }

  async deleteByHouseholdId(householdId: string): Promise<void> {
    for (const [id, rule] of this.rules) {
      if (rule.householdId === householdId) {
        this.rules.delete(id);
      }
    }
  }
}