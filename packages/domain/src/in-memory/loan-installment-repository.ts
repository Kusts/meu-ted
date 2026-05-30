import type { LoanInstallment } from '../core/entities/loan';
import type { ILoanInstallmentRepository } from '../core/repositories/loan-installment-repository';

export class InMemoryLoanInstallmentRepository implements ILoanInstallmentRepository {
  private installments: LoanInstallment[] = [];

  async findByLoanId(loanId: string): Promise<LoanInstallment[]> {
    return this.installments.filter(i => i.loanId === loanId);
  }

  async findById(id: string): Promise<LoanInstallment | null> {
    return this.installments.find(i => i.id === id) ?? null;
  }

  async update(installment: LoanInstallment): Promise<LoanInstallment> {
    const idx = this.installments.findIndex(i => i.id === installment.id);
    if (idx >= 0) {
      this.installments[idx] = installment;
    }
    return installment;
  }

  async createBatch(installments: LoanInstallment[]): Promise<LoanInstallment[]> {
    this.installments.push(...installments);
    return installments;
  }
}