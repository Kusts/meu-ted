import type { FinancialRecord, RecordUpdate } from '../entities/financial-record.js';

/**
 * Financial Record Repository Port
 */
export interface IFinancialRecordRepository {
  create(record: FinancialRecord): Promise<FinancialRecord>;
  findById(id: string): Promise<FinancialRecord | null>;
  findByHouseholdId(householdId: string, limit?: number): Promise<FinancialRecord[]>;
  findByIdempotencyKey(householdId: string, key: string): Promise<FinancialRecord | null>;
  findDuplicateCandidate(
    householdId: string, 
    accountId: string, 
    amountCents: number, 
    description: string,
    withinMinutes: number,
    minSimilarity?: number
  ): Promise<FinancialRecord | null>;
  findByAccountId(accountId: string): Promise<FinancialRecord[]>;
  update(id: string, update: RecordUpdate): Promise<FinancialRecord | null>;
  softDelete(id: string): Promise<FinancialRecord | null>;
  findByHouseholdIdFiltered(
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
  ): Promise<{ records: FinancialRecord[]; total: number }>;
  findRecentByHouseholdId(householdId: string, since: Date): Promise<FinancialRecord[]>;
}