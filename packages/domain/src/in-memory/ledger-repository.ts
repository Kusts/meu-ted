import type { LedgerEntry } from '../core/entities/ledger-entry.js';
import type { ILedgerRepository } from '../core/repositories/ledger-repository.js';

export class InMemoryLedgerRepository implements ILedgerRepository {
  private entries: Map<string, LedgerEntry> = new Map();

  async create(entry: LedgerEntry): Promise<LedgerEntry> {
    this.entries.set(entry.id, { ...entry });
    return { ...entry };
  }

  async findByRecordId(recordId: string): Promise<LedgerEntry[]> {
    return Array.from(this.entries.values()).filter(e => e.recordId === recordId);
  }

  async findByAccountId(accountId: string): Promise<LedgerEntry[]> {
    return Array.from(this.entries.values()).filter(e => e.accountId === accountId);
  }

  async findByHouseholdId(householdId: string): Promise<LedgerEntry[]> {
    return Array.from(this.entries.values()).filter(e => e.householdId === householdId);
  }
}