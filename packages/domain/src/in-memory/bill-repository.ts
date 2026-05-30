import type { Bill, BillStatus } from '../core/entities/bill.js';
import type { IBillRepository } from '../core/repositories/bill-repository.js';

export class InMemoryBillRepository implements IBillRepository {
  private bills: Map<string, Bill> = new Map();

  async create(bill: Bill): Promise<Bill> {
    this.bills.set(bill.id, { ...bill });
    return { ...bill };
  }

  async findById(id: string): Promise<Bill | null> {
    return this.bills.get(id) ?? null;
  }

  async findByHouseholdId(householdId: string): Promise<Bill[]> {
    return Array.from(this.bills.values()).filter(
      b => b.householdId === householdId
    );
  }

  async findByRecurrenceId(recurrenceId: string): Promise<Bill[]> {
    return Array.from(this.bills.values()).filter(
      b => b.recurrenceId === recurrenceId
    );
  }

  async findOverdueByHouseholdId(householdId: string): Promise<Bill[]> {
    return Array.from(this.bills.values()).filter(
      b => b.householdId === householdId && b.status === 'overdue'
    );
  }

  async update(id: string, update: { status?: BillStatus; paidAt?: string | null; recordId?: string | null; paidAmountCents?: number | null; interestRecordId?: string | null; originalAmountCents?: number | null }): Promise<Bill | null> {
    const existing = this.bills.get(id);
    if (!existing) return null;

    const updated: Bill = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.bills.set(id, updated);
    return { ...updated };
  }
}