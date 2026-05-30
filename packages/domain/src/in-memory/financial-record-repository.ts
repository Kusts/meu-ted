import type { FinancialRecord, RecordUpdate } from '../core/entities/financial-record.js';
import type { IFinancialRecordRepository } from '../core/repositories/financial-record-repository.js';

export class InMemoryFinancialRecordRepository implements IFinancialRecordRepository {
  private records: Map<string, FinancialRecord> = new Map();

  async create(record: FinancialRecord): Promise<FinancialRecord> {
    this.records.set(record.id, { ...record });
    return { ...record };
  }

  async findById(id: string): Promise<FinancialRecord | null> {
    return this.records.get(id) ?? null;
  }

  async findByHouseholdId(householdId: string, limit?: number): Promise<FinancialRecord[]> {
    const results = Array.from(this.records.values())
      .filter(r => r.householdId === householdId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return limit ? results.slice(0, limit) : results;
  }

  async findByIdempotencyKey(householdId: string, key: string): Promise<FinancialRecord | null> {
    return Array.from(this.records.values()).find(
      r => r.householdId === householdId && r.idempotencyKey === key
    ) ?? null;
  }

  async findDuplicateCandidate(
    householdId: string,
    accountId: string,
    amountCents: number,
    description: string,
    withinMinutes: number
  ): Promise<FinancialRecord | null> {
    const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000);
    return Array.from(this.records.values()).find(r => {
      if (r.householdId !== householdId) return false;
      if (r.accountId !== accountId) return false;
      if (r.amountCents !== amountCents) return false;
      if (!r.description.toLowerCase().includes(description.toLowerCase())) return false;
      return new Date(r.createdAt) >= cutoff;
    }) ?? null;
  }

  async findByAccountId(accountId: string): Promise<FinancialRecord[]> {
    return Array.from(this.records.values()).filter(
      r => r.accountId === accountId || r.fromAccountId === accountId || r.toAccountId === accountId
    );
  }

  async update(id: string, update: RecordUpdate): Promise<FinancialRecord | null> {
    const existing = this.records.get(id);
    if (!existing) return null;

    const updated: FinancialRecord = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(id, updated);
    return { ...updated };
  }
}