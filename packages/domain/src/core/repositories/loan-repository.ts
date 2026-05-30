import type { Loan } from '../entities/loan';

export interface ILoanRepository {
  findById(id: string): Promise<Loan | null>;
  findByHouseholdId(householdId: string): Promise<Loan[]>;
  create(loan: Loan): Promise<Loan>;
}