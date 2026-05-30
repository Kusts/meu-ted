import type { Bill, BillStatus } from '../entities/bill.js';

/**
 * Bill Repository Port (REQ-016, REQ-017)
 */
export interface IBillRepository {
  create(bill: Bill): Promise<Bill>;
  findById(id: string): Promise<Bill | null>;
  findByHouseholdId(householdId: string): Promise<Bill[]>;
  findByRecurrenceId(recurrenceId: string): Promise<Bill[]>;
  findOverdueByHouseholdId(householdId: string): Promise<Bill[]>;
  update(id: string, update: { status?: BillStatus; paidAt?: string | null; recordId?: string | null; paidAmountCents?: number | null; interestRecordId?: string | null; originalAmountCents?: number | null }): Promise<Bill | null>;
}