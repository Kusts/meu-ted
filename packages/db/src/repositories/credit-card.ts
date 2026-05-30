// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Credit Card Repository
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq } from 'drizzle-orm';
import type { CreditCard, CreditCardUpdate } from '@pi-financeiro/domain';
import type { ICreditCardRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { creditCards } from '../schema/index.js';
import { toDbCreditCard, fromDbCreditCard } from '../mappers/credit-card.js';

export class DrizzleCreditCardRepository implements ICreditCardRepository {
  constructor(private dbClient: DbClient) {}

  async create(card: CreditCard): Promise<CreditCard> {
    const dbRow = toDbCreditCard(card);
    const [inserted] = await this.dbClient.db.insert(creditCards).values(dbRow).returning();
    return fromDbCreditCard(inserted);
  }

  async findById(id: string): Promise<CreditCard | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(creditCards)
      .where(eq(creditCards.id, id))
      .limit(1);
    return row ? fromDbCreditCard(row) : null;
  }

  async findByHouseholdId(householdId: string): Promise<CreditCard[]> {
    const rows = await this.dbClient.db
      .select()
      .from(creditCards)
      .where(eq(creditCards.householdId, householdId));
    return rows.map(fromDbCreditCard);
  }

  async findActive(householdId: string): Promise<CreditCard[]> {
    const rows = await this.dbClient.db
      .select()
      .from(creditCards)
      .where(and(eq(creditCards.householdId, householdId), eq(creditCards.active, true)));
    return rows.map(fromDbCreditCard);
  }

  async update(id: string, update: CreditCardUpdate): Promise<CreditCard | null> {
    const updateData: Partial<typeof creditCards.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (update.name !== undefined) updateData.name = update.name;
    if (update.limitCents !== undefined) updateData.limitCents = update.limitCents;
    if (update.closingDay !== undefined) updateData.closingDay = update.closingDay;
    if (update.dueDay !== undefined) updateData.dueDay = update.dueDay;
    if (update.active !== undefined) updateData.active = update.active;

    const [updated] = await this.dbClient.db
      .update(creditCards)
      .set(updateData)
      .where(eq(creditCards.id, id))
      .returning();
    
    return updated ? fromDbCreditCard(updated) : null;
  }
}
