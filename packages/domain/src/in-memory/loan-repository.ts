import type { Loan } from '../core/entities/loan';
import type { ILoanRepository } from '../core/repositories/loan-repository';

export class InMemoryLoanRepository implements ILoanRepository {
  private loans: Loan[] = [];

  async findById(id: string): Promise<Loan | null> {
    return this.loans.find(l => l.id === id) ?? null;
  }

  async findByHouseholdId(householdId: string): Promise<Loan[]> {
    return this.loans.filter(l => l.householdId === householdId);
  }

  async create(loan: Loan): Promise<Loan> {
    this.loans.push(loan);
    return loan;
  }
}