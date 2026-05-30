// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Household Repository
// ─────────────────────────────────────────────────────────────────────────────

import { eq } from 'drizzle-orm';
import type { Household, HouseholdCreate, HouseholdUpdate } from '@pi-financeiro/domain';
import type { IHouseholdRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { households } from '../schema/index.js';
import { fromDbHousehold } from '../mappers/household.js';

export class DrizzleHouseholdRepository implements IHouseholdRepository {
  constructor(private dbClient: DbClient) {}

  async create(household: HouseholdCreate): Promise<Household> {
    const now = new Date();
    const dbRow = {
      id: household.id,
      name: household.name,
      currency: (household.currency ?? 'BRL') as 'BRL',
      timezone: (household.timezone ?? 'America/Sao_Paulo') as 'America/Sao_Paulo',
      highValueThresholdCents: 50000,
      createdAt: now,
      updatedAt: now,
    };
    const [inserted] = await this.dbClient.db.insert(households).values(dbRow).returning();
    return fromDbHousehold(inserted);
  }

  async findById(id: string): Promise<Household | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(households)
      .where(eq(households.id, id))
      .limit(1);
    return row ? fromDbHousehold(row) : null;
  }

  async findAll(): Promise<Household[]> {
    const rows = await this.dbClient.db.select().from(households);
    return rows.map(fromDbHousehold);
  }

  async update(id: string, update: HouseholdUpdate): Promise<Household | null> {
    const updateData: Partial<typeof households.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (update.name !== undefined) updateData.name = update.name;
    if (update.currency !== undefined) updateData.currency = update.currency as typeof updateData.currency;
    if (update.timezone !== undefined) updateData.timezone = update.timezone as typeof updateData.timezone;

    const [updated] = await this.dbClient.db
      .update(households)
      .set(updateData)
      .where(eq(households.id, id))
      .returning();
    
    return updated ? fromDbHousehold(updated) : null;
  }
}
