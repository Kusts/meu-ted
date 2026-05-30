// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Installment Group Repository
// ─────────────────────────────────────────────────────────────────────────────

import { eq } from 'drizzle-orm';
import type { InstallmentGroup } from '@pi-financeiro/domain';
import type { IInstallmentGroupRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { installmentGroups } from '../schema/index.js';
import { toDbInstallmentGroup, fromDbInstallmentGroup } from '../mappers/installment-group.js';

export class DrizzleInstallmentGroupRepository implements IInstallmentGroupRepository {
  constructor(private dbClient: DbClient) {}

  async create(group: InstallmentGroup): Promise<InstallmentGroup> {
    const dbRow = toDbInstallmentGroup(group);
    const [inserted] = await this.dbClient.db.insert(installmentGroups).values(dbRow).returning();
    return fromDbInstallmentGroup(inserted);
  }

  async findById(id: string): Promise<InstallmentGroup | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(installmentGroups)
      .where(eq(installmentGroups.id, id))
      .limit(1);
    return row ? fromDbInstallmentGroup(row) : null;
  }

  async findByHouseholdId(householdId: string): Promise<InstallmentGroup[]> {
    const rows = await this.dbClient.db
      .select()
      .from(installmentGroups)
      .where(eq(installmentGroups.householdId, householdId));
    return rows.map(fromDbInstallmentGroup);
  }
}
