import type { LoanInstallment } from '../entities/loan';

export interface ILoanInstallmentRepository {
  findByLoanId(loanId: string): Promise<LoanInstallment[]>;
  findById(id: string): Promise<LoanInstallment | null>;
  update(installment: LoanInstallment): Promise<LoanInstallment>;
  createBatch(installments: LoanInstallment[]): Promise<LoanInstallment[]>;
}