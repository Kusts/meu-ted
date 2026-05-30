import type { Loan, LoanInstallment } from '../entities/loan';
import type { ILoanRepository } from '../repositories/loan-repository';
import type { ILoanInstallmentRepository } from '../repositories/loan-installment-repository';

export interface CreateLoanParams {
  householdId: string;
  name: string;
  principalCents: number;
  mode: 'fixed' | 'price' | 'sac' | 'custom';
  interestRate: number | null;
  startDate: string;
  installmentsCount: number;
}

export interface CreateLoanResult {
  loan: Loan;
  installments: LoanInstallment[];
}

export interface PayInstallmentResult {
  success: boolean;
  installment?: LoanInstallment;
  error?: string;
}

export class LoanService {
  constructor(
    private readonly loanRepo: ILoanRepository,
    private readonly installmentRepo: ILoanInstallmentRepository,
  ) {}

  async createLoan(params: CreateLoanParams): Promise<CreateLoanResult> {
    const now = new Date().toISOString();
    
    const loan: Loan = {
      id: crypto.randomUUID(),
      householdId: params.householdId,
      name: params.name,
      principalCents: params.principalCents,
      mode: params.mode,
      interestRate: params.interestRate,
      startDate: params.startDate,
      installmentsCount: params.installmentsCount,
      createdAt: now,
      updatedAt: now,
    };

    const createdLoan = await this.loanRepo.create(loan);
    
    const installments = this.generateInstallments(createdLoan);
    const createdInstallments = await this.installmentRepo.createBatch(installments);
    
    return { loan: createdLoan, installments: createdInstallments };
  }

  private generateInstallments(loan: Loan): LoanInstallment[] {
    const installments: LoanInstallment[] = [];
    const { principalCents, mode, interestRate, startDate, installmentsCount } = loan;
    const now = new Date().toISOString();

    for (let i = 0; i < installmentsCount; i++) {
      const dueDate = this.addMonths(startDate, i);
      
      let principalCents_i: number;
      let interestCents_i: number;
      let totalCents_i: number;

      if (mode === 'fixed') {
        // Equal installments, zero interest
        principalCents_i = Math.round(principalCents / installmentsCount);
        interestCents_i = 0;
        totalCents_i = principalCents_i;
      } else if (mode === 'price' && interestRate !== null && interestRate > 0) {
        // PRICE (Price/SAC): PMT constant throughout
        const r = interestRate / 10000; // basis points to decimal
        const n = installmentsCount;
        const p = principalCents;
        
        // PMT = P * [r(1+r)^n] / [(1+r)^n - 1]
        const pmt = p * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        
        // Track balance month by month
        let balance = p;
        for (let m = 0; m <= i; m++) {
          const interest_m = Math.round(balance * r);
          const principal_m = Math.round(pmt - interest_m);
          balance = balance - principal_m;
        }
        // At month i, we need the values for THIS installment
        let currentBalance = p;
        for (let m = 0; m < i; m++) {
          const interest_m = Math.round(currentBalance * r);
          const principal_m = Math.round(pmt - interest_m);
          currentBalance -= principal_m;
        }
        const interest_i = Math.round(currentBalance * r);
        const principal_i = Math.round(pmt - interest_i);
        
        principalCents_i = principal_i;
        interestCents_i = interest_i;
        totalCents_i = Math.round(pmt);
      } else if (mode === 'sac' && interestRate !== null && interestRate > 0) {
        // SAC: fixed amortization, decreasing interest
        const amort = principalCents / installmentsCount;
        const balance = principalCents - (amort * i);
        const interest_i = Math.round(balance * (interestRate / 10000));
        
        principalCents_i = Math.round(amort);
        interestCents_i = interest_i;
        totalCents_i = principalCents_i + interestCents_i;
      } else {
        // custom: empty installments
        principalCents_i = 0;
        interestCents_i = 0;
        totalCents_i = 0;
      }

      installments.push({
        id: crypto.randomUUID(),
        householdId: loan.householdId,
        loanId: loan.id,
        dueDate,
        principalCents: principalCents_i,
        interestCents: interestCents_i,
        totalCents: totalCents_i,
        status: 'pending',
        paidAt: null,
        createdAt: now,
      });
    }

    return installments;
  }

  private addMonths(dateStr: string, months: number): string {
    // UTC-safe month addition
    const [year, month, day] = dateStr.split('-').map(Number);
    let newYear = year;
    let newMonth = month + months;
    
    while (newMonth > 12) {
      newMonth -= 12;
      newYear += 1;
    }
    while (newMonth < 1) {
      newMonth += 12;
      newYear -= 1;
    }
    
    // Clamp day to max of target month
    const maxDay = new Date(newYear, newMonth, 0).getDate();
    const clampedDay = Math.min(day, maxDay);
    
    return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}T00:00:00.000Z`;
  }

  async payInstallment(params: { householdId: string; installmentId: string; paidAt: string }): Promise<PayInstallmentResult> {
    const installment = await this.installmentRepo.findById(params.installmentId);
    
    if (!installment) {
      return { success: false, error: 'Parcela não encontrada' };
    }
    
    if (installment.householdId !== params.householdId) {
      return { success: false, error: 'Parcela não pertence a este household' };
    }

    const updated: LoanInstallment = {
      ...installment,
      status: 'paid',
      paidAt: params.paidAt,
    };

    const result = await this.installmentRepo.update(updated);
    return { success: true, installment: result };
  }

  async getLoanById(id: string): Promise<Loan | null> {
    return this.loanRepo.findById(id);
  }

  async listByHousehold(householdId: string): Promise<Loan[]> {
    return this.loanRepo.findByHouseholdId(householdId);
  }

  async listInstallmentsByLoanId(loanId: string): Promise<LoanInstallment[]> {
    return this.installmentRepo.findByLoanId(loanId);
  }
}