// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Bill Repository
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, desc, lte } from 'drizzle-orm';
import type { Bill, BillStatus } from '@pi-financeiro/domain';
import type { IBillRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { bills } from '../schema/index.js';
import { toDbBill, fromDbBill } from '../mappers/bill.js';

export class DrizzleBillRepository implements IBillRepository {
  constructor(private dbClient: DbClient) {}

  async create(bill: Bill): Promise<Bill> {
    const dbRow = toDbBill(bill);
    const [inserted] = await this.dbClient.db.insert(bills).values(dbRow).returning();
    return fromDbBill(inserted);
  }

  async findById(id: string): Promise<Bill | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(bills)
      .where(eq(bills.id, id))
      .limit(1);
    return row ? fromDbBill(row) : null;
  }

  async findByHouseholdId(householdId: string): Promise<Bill[]> {
    const rows = await this.dbClient.db
      .select()
      .from(bills)
      .where(eq(bills.householdId, householdId))
      .orderBy(desc(bills.dueDate));
    return rows.map(fromDbBill);
  }

  async findByRecurrenceId(recurrenceId: string): Promise<Bill[]> {
    const rows = await this.dbClient.db
      .select()
      .from(bills)
      .where(eq(bills.recurrenceId, recurrenceId))
      .orderBy(desc(bills.dueDate));
    return rows.map(fromDbBill);
  }

  async findOverdueByHouseholdId(householdId: string): Promise<Bill[]> {
    const now = new Date();
    const rows = await this.dbClient.db
      .select()
      .from(bills)
      .where(and(
        eq(bills.householdId, householdId),
        eq(bills.status, 'pending'),
        lte(bills.dueDate, now)
      ))
      .orderBy(bills.dueDate);
    return rows.map(fromDbBill);
  }

  async update(
    id: string,
    update: { status?: BillStatus; paidAt?: string | null; recordId?: string | null; paidAmountCents?: number | null; interestRecordId?: string | null; originalAmountCents?: number | null }
  ): Promise<Bill | null> {
    const updateData: Partial<typeof bills.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (update.status !== undefined) updateData.status = update.status;
    if (update.paidAt !== undefined) updateData.paidAt = update.paidAt ? new Date(update.paidAt) : null;
    if (update.recordId !== undefined) updateData.recordId = update.recordId;

    const [updated] = await this.dbClient.db
      .update(bills)
      .set(updateData)
      .where(eq(bills.id, id))
      .returning();
    
    return updated ? fromDbBill(updated) : null;
  }
}
