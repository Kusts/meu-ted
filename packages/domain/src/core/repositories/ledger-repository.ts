import type { LedgerEntry } from '../entities/ledger-entry.js';

/**
 * Ledger Entry Repository Port
 * Ledger entries are immutable (no update/delete) - REQ-033 balance from entries
 */
export interface ILedgerRepository {
  create(entry: LedgerEntry): Promise<LedgerEntry>;
  findByRecordId(recordId: string): Promise<LedgerEntry[]>;
  findByAccountId(accountId: string): Promise<LedgerEntry[]>;
  findByHouseholdId(householdId: string): Promise<LedgerEntry[]>;
}