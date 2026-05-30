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
    withinMinutes: number,
    minSimilarity: number = 0.7
  ): Promise<FinancialRecord | null> {
    const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000);
    const normalizedInput = this.normalizeDescription(description);
    
    return Array.from(this.records.values()).find(r => {
      if (r.householdId !== householdId) return false;
      if (r.accountId !== accountId) return false;
      if (r.amountCents !== amountCents) return false;
      if (new Date(r.createdAt) < cutoff) return false;
      
      const normalizedExisting = this.normalizeDescription(r.description);
      const similarity = this.calculateSimilarity(normalizedInput, normalizedExisting);
      return similarity >= minSimilarity; // Use dynamic threshold
    }) ?? null;
  }

  private normalizeDescription(desc: string): string {
    return desc
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private calculateSimilarity(a: string, b: string): number {
    // Exact match
    if (a === b) return 1;
    // One contains the other
    if (a.includes(b) || b.includes(a)) return 0.85;
    // Levenshtein distance
    const distance = this.levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : 1 - distance / maxLen;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
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

  async softDelete(id: string): Promise<FinancialRecord | null> {
    const existing = this.records.get(id);
    if (!existing) return null;

    const updated: FinancialRecord = {
      ...existing,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    };
    this.records.set(id, updated);
    return { ...updated };
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

    let results = Array.from(this.records.values())
      .filter(r => r.householdId === householdId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Filter by type (expense, income, transfer)
    if (filters.type) {
      results = results.filter(r => r.type === filters.type);
    }

    // Filter by accountId (matches accountId, fromAccountId, or toAccountId)
    if (filters.accountId) {
      results = results.filter(r =>
        r.accountId === filters.accountId ||
        r.fromAccountId === filters.accountId ||
        r.toAccountId === filters.accountId
      );
    }

    // Filter by cardId
    if (filters.cardId) {
      results = results.filter(r => r.cardId === filters.cardId);
    }

    // Filter by categoryId
    if (filters.categoryId) {
      results = results.filter(r => r.categoryId === filters.categoryId);
    }

    // Filter by date range
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      results = results.filter(r => new Date(r.date) >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      results = results.filter(r => new Date(r.date) <= to);
    }

    // Filter by source
    if (filters.source) {
      results = results.filter(r => r.source === filters.source);
    }

    // Filter by status
    if (filters.status) {
      results = results.filter(r => r.status === filters.status);
    }

    const total = results.length;
    const paginated = results.slice(offset, offset + limit);

    return { records: paginated, total };
  }

  async findRecentByHouseholdId(householdId: string, since: Date): Promise<FinancialRecord[]> {
    return Array.from(this.records.values())
      .filter(r => r.householdId === householdId && new Date(r.createdAt) >= since)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}