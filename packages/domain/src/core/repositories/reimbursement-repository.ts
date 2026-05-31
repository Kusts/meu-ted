// ─────────────────────────────────────────────────────────────────────────────
// Reimbursement Repository Port
// ─────────────────────────────────────────────────────────────────────────────

import type { Reimbursement, ReimbursementStatus } from '../entities/reimbursement.js';

export interface IReimbursementRepository {
  create(reimbursement: Reimbursement): Promise<Reimbursement>;
  findById(id: string): Promise<Reimbursement | null>;
  findByHouseholdId(householdId: string): Promise<Reimbursement[]>;
  findByOriginalRecordId(originalRecordId: string): Promise<Reimbursement | null>;
  update(id: string, update: { status?: ReimbursementStatus; reimbursementRecordId?: string | null }): Promise<Reimbursement | null>;
  delete(id: string): Promise<boolean>;
}
