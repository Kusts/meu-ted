// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Invoice Repository
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, desc } from 'drizzle-orm';
import type { Invoice } from '@pi-financeiro/domain';
import type { IInvoiceRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { invoices } from '../schema/index.js';
import { toDbInvoice, fromDbInvoice } from '../mappers/invoice.js';

export class DrizzleInvoiceRepository implements IInvoiceRepository {
  constructor(private dbClient: DbClient) {}

  async create(invoice: Invoice): Promise<Invoice> {
    const dbRow = toDbInvoice(invoice);
    const [inserted] = await this.dbClient.db.insert(invoices).values(dbRow).returning();
    return fromDbInvoice(inserted);
  }

  async findById(id: string): Promise<Invoice | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1);
    return row ? fromDbInvoice(row) : null;
  }

  async findByHouseholdId(householdId: string): Promise<Invoice[]> {
    const rows = await this.dbClient.db
      .select()
      .from(invoices)
      .where(eq(invoices.householdId, householdId))
      .orderBy(desc(invoices.periodYear), desc(invoices.periodMonth));
    return rows.map(fromDbInvoice);
  }

  async findByCardId(cardId: string): Promise<Invoice[]> {
    const rows = await this.dbClient.db
      .select()
      .from(invoices)
      .where(eq(invoices.cardId, cardId))
      .orderBy(desc(invoices.periodYear), desc(invoices.periodMonth));
    return rows.map(fromDbInvoice);
  }

  async findByCardAndPeriod(cardId: string, periodMonth: number, periodYear: number): Promise<Invoice | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.cardId, cardId),
        eq(invoices.periodMonth, periodMonth),
        eq(invoices.periodYear, periodYear)
      ))
      .limit(1);
    return row ? fromDbInvoice(row) : null;
  }

  async findOpenByCardId(cardId: string): Promise<Invoice | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.cardId, cardId), eq(invoices.status, 'open')))
      .orderBy(desc(invoices.periodYear), desc(invoices.periodMonth))
      .limit(1);
    return row ? fromDbInvoice(row) : null;
  }

  async findOpenInvoices(): Promise<Invoice[]> {
    const rows = await this.dbClient.db
      .select()
      .from(invoices)
      .where(eq(invoices.status, 'open'))
      .orderBy(desc(invoices.periodYear), desc(invoices.periodMonth));
    return rows.map(fromDbInvoice);
  }

  async update(id: string, update: { status?: 'open' | 'closed' | 'paid'; totalCents?: number; paidAt?: string | null }): Promise<Invoice | null> {
    const updateData: Partial<typeof invoices.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (update.status !== undefined) updateData.status = update.status;
    if (update.totalCents !== undefined) updateData.totalCents = update.totalCents;
    if (update.paidAt !== undefined) updateData.paidAt = update.paidAt ? new Date(update.paidAt) : null;

    const [updated] = await this.dbClient.db
      .update(invoices)
      .set(updateData)
      .where(eq(invoices.id, id))
      .returning();
    
    return updated ? fromDbInvoice(updated) : null;
  }
}
