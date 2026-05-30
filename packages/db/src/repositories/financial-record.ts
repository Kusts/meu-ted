// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Financial Record Repository
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, desc, gte, lte, or } from 'drizzle-orm';
import type { FinancialRecord, RecordUpdate } from '@pi-financeiro/domain';
import type { IFinancialRecordRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { financialRecords } from '../schema/index.js';
import { toDbFinancialRecord, fromDbFinancialRecord } from '../mappers/financial-record.js';

export class DrizzleFinancialRecordRepository implements IFinancialRecordRepository {
  constructor(private dbClient: DbClient) {}

  async create(record: FinancialRecord): Promise<FinancialRecord> {
    const dbRow = toDbFinancialRecord(record);
    const [inserted] = await this.dbClient.db.insert(financialRecords).values(dbRow).returning();
    return fromDbFinancialRecord(inserted);
  }

  async findById(id: string): Promise<FinancialRecord | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(financialRecords)
      .where(eq(financialRecords.id, id))
      .limit(1);
    return row ? fromDbFinancialRecord(row) : null;
  }

  async findByHouseholdId(householdId: string, limit?: number): Promise<FinancialRecord[]> {
    const baseQuery = this.dbClient.db
      .select()
      .from(financialRecords)
      .where(eq(financialRecords.householdId, householdId))
      .orderBy(desc(financialRecords.date));
    
    const rows = limit ? await baseQuery.limit(limit) : await baseQuery;
    return rows.map(fromDbFinancialRecord);
  }

  async findByIdempotencyKey(householdId: string, key: string): Promise<FinancialRecord | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(financialRecords)
      .where(and(eq(financialRecords.householdId, householdId), eq(financialRecords.idempotencyKey, key)))
      .limit(1);
    return row ? fromDbFinancialRecord(row) : null;
  }

  async findDuplicateCandidate(
    householdId: string,
    accountId: string,
    amountCents: number,
    description: string,
    withinMinutes: number
  ): Promise<FinancialRecord | null> {
    const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000);
    
    const rows = await this.dbClient.db
      .select()
      .from(financialRecords)
      .where(
        and(
          eq(financialRecords.householdId, householdId),
          eq(financialRecords.accountId, accountId),
          eq(financialRecords.amountCents, amountCents)
        )
      )
      .limit(10);
    
    // Fuzzy match on description
    const lowerDesc = description.toLowerCase();
    for (const row of rows) {
      if (row.description.toLowerCase().includes(lowerDesc)) {
        const createdAt = new Date(row.createdAt);
        if (createdAt >= cutoff) {
          return fromDbFinancialRecord(row);
        }
      }
    }
    
    return null;
  }

  async findByAccountId(accountId: string): Promise<FinancialRecord[]> {
    const rows = await this.dbClient.db
      .select()
      .from(financialRecords)
      .where(eq(financialRecords.accountId, accountId));
    return rows.map(fromDbFinancialRecord);
  }

  async update(id: string, update: RecordUpdate): Promise<FinancialRecord | null> {
    const updateData: Partial<typeof financialRecords.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (update.amountCents !== undefined) updateData.amountCents = update.amountCents;
    if (update.date !== undefined) updateData.date = new Date(update.date);
    if (update.description !== undefined) updateData.description = update.description;
    if (update.accountId !== undefined) updateData.accountId = update.accountId;
    if (update.categoryId !== undefined) updateData.categoryId = update.categoryId;
    if (update.status !== undefined) updateData.status = update.status;
    if (update.confirmedAt !== undefined) {
      updateData.confirmedAt = update.confirmedAt ? new Date(update.confirmedAt) : null;
    }

    const [updated] = await this.dbClient.db
      .update(financialRecords)
      .set(updateData)
      .where(eq(financialRecords.id, id))
      .returning();
    
    return updated ? fromDbFinancialRecord(updated) : null;
  }

  async findByHouseholdIdFiltered(
    householdId: string,
    filters: {
      type?: string;
      accountId?: string;
      cardId?: string;
      categoryId?: string;
      dateFrom?: string;
      dateTo?: string;
      source?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ records: FinancialRecord[]; total: number }> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const conditions = [eq(financialRecords.householdId, householdId)];

    if (filters.type) {
      conditions.push(eq(financialRecords.type, filters.type as 'expense' | 'income' | 'transfer'));
    }

    if (filters.accountId) {
      const accountConditions = [
        eq(financialRecords.accountId, filters.accountId),
        eq(financialRecords.fromAccountId, filters.accountId),
        eq(financialRecords.toAccountId, filters.accountId),
      ];
      conditions.push(or(...accountConditions) as ReturnType<typeof eq>);
    }

    if (filters.cardId) {
      conditions.push(eq(financialRecords.cardId, filters.cardId));
    }

    if (filters.categoryId) {
      conditions.push(eq(financialRecords.categoryId, filters.categoryId));
    }

    if (filters.dateFrom) {
      conditions.push(gte(financialRecords.date, new Date(filters.dateFrom)));
    }

    if (filters.dateTo) {
      conditions.push(lte(financialRecords.date, new Date(filters.dateTo)));
    }

    if (filters.source) {
      conditions.push(eq(financialRecords.source, filters.source as 'whatsapp' | 'dashboard' | 'cron' | 'agent'));
    }

    if (filters.status) {
      conditions.push(eq(financialRecords.status, filters.status as 'posted' | 'scheduled' | 'paid' | 'overdue' | 'cancelled' | 'review'));
    }

    const whereClause = and(...conditions);

    // Get total count
    const countResult = await this.dbClient.db
      .select({ count: financialRecords.id })
      .from(financialRecords)
      .where(whereClause);
    const total = countResult.length;

    // Get paginated results
    const rows = await this.dbClient.db
      .select()
      .from(financialRecords)
      .where(whereClause)
      .orderBy(desc(financialRecords.date))
      .limit(limit)
      .offset(offset);

    return { records: rows.map(fromDbFinancialRecord), total };
  }
}
