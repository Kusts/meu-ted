// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Ledger Repository
// ─────────────────────────────────────────────────────────────────────────────

import { eq } from 'drizzle-orm';
import type { LedgerEntry } from '@pi-financeiro/domain';
import type { ILedgerRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { ledgerEntries } from '../schema/index.js';
import { toDbLedgerEntry, fromDbLedgerEntry } from '../mappers/ledger.js';

export class DrizzleLedgerRepository implements ILedgerRepository {
  constructor(private dbClient: DbClient) {}

  async create(entry: LedgerEntry): Promise<LedgerEntry> {
    const dbRow = toDbLedgerEntry(entry);
    const [inserted] = await this.dbClient.db.insert(ledgerEntries).values(dbRow).returning();
    return fromDbLedgerEntry(inserted);
  }

  async findByRecordId(recordId: string): Promise<LedgerEntry[]> {
    const rows = await this.dbClient.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.recordId, recordId));
    return rows.map(fromDbLedgerEntry);
  }

  async findByAccountId(accountId: string): Promise<LedgerEntry[]> {
    const rows = await this.dbClient.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.accountId, accountId));
    return rows.map(fromDbLedgerEntry);
  }

  async findByHouseholdId(householdId: string): Promise<LedgerEntry[]> {
    const rows = await this.dbClient.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.householdId, householdId));
    return rows.map(fromDbLedgerEntry);
  }
}
