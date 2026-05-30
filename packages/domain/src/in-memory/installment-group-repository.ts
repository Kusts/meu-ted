import type { InstallmentGroup } from '../core/entities/installment-group.js';
import type { IInstallmentGroupRepository } from '../core/repositories/installment-group-repository.js';

export class InMemoryInstallmentGroupRepository implements IInstallmentGroupRepository {
  private groups: Map<string, InstallmentGroup> = new Map();

  async create(group: InstallmentGroup): Promise<InstallmentGroup> {
    this.groups.set(group.id, { ...group });
    return { ...group };
  }

  async findById(id: string): Promise<InstallmentGroup | null> {
    return this.groups.get(id) ?? null;
  }

  async findByHouseholdId(householdId: string): Promise<InstallmentGroup[]> {
    return Array.from(this.groups.values()).filter(g => g.householdId === householdId);
  }
}