// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Reimbursement Repository
// ─────────────────────────────────────────────────────────────────────────────

import type { Reimbursement, ReimbursementStatus } from '../core/entities/reimbursement.js';
import type { IReimbursementRepository } from '../core/repositories/reimbursement-repository.js';

export class InMemoryReimbursementRepository implements IReimbursementRepository {
  private reimbursements: Map<string, Reimbursement> = new Map();

  async create(reimbursement: Reimbursement): Promise<Reimbursement> {
    this.reimbursements.set(reimbursement.id, { ...reimbursement });
    return { ...reimbursement };
  }

  async findById(id: string): Promise<Reimbursement | null> {
    return this.reimbursements.get(id) ?? null;
  }

  async findByHouseholdId(householdId: string): Promise<Reimbursement[]> {
    return Array.from(this.reimbursements.values()).filter(r => r.householdId === householdId);
  }

  async findByOriginalRecordId(originalRecordId: string): Promise<Reimbursement | null> {
    return Array.from(this.reimbursements.values()).find(r => r.originalRecordId === originalRecordId) ?? null;
  }

  async update(
    id: string,
    update: { status?: ReimbursementStatus; reimbursementRecordId?: string | null }
  ): Promise<Reimbursement | null> {
    const existing = this.reimbursements.get(id);
    if (!existing) return null;
    const updated: Reimbursement = {
      ...existing,
      ...(update.status !== undefined ? { status: update.status } : {}),
      ...(update.reimbursementRecordId !== undefined ? { reimbursementRecordId: update.reimbursementRecordId } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.reimbursements.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.reimbursements.delete(id);
  }
}
