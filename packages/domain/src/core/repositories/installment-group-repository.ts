import type { InstallmentGroup } from '../entities/installment-group.js';

/**
 * Installment Group Repository Port (REQ-013)
 */
export interface IInstallmentGroupRepository {
  create(group: InstallmentGroup): Promise<InstallmentGroup>;
  findById(id: string): Promise<InstallmentGroup | null>;
  findByHouseholdId(householdId: string): Promise<InstallmentGroup[]>;
}