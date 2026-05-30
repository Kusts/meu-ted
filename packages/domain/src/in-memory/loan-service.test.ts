import { describe, it, expect, beforeEach } from 'vitest';
import { LoanService } from '../core/services/loan-service';
import { InMemoryLoanRepository } from './loan-repository';
import { InMemoryLoanInstallmentRepository } from './loan-installment-repository';
import type { LoanMode } from '../core/entities/loan';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function makeLoan(overrides: Partial<{
  id: string;
  householdId: string;
  name: string;
  principalCents: number;
  mode: LoanMode;
  interestRate: number | null;
  startDate: string;
  installmentsCount: number;
}> = {}): any {
  return {
    id: uuid(),
    householdId: uuid(),
    name: 'Test Loan',
    principalCents: 12000,
    mode: 'fixed' as LoanMode,
    interestRate: null,
    startDate: '2026-01-01T00:00:00.000Z',
    installmentsCount: 3,
    ...overrides,
  };
}

describe('LoanService', () => {
  let loanRepo: InMemoryLoanRepository;
  let installmentRepo: InMemoryLoanInstallmentRepository;
  let service: LoanService;

  beforeEach(() => {
    loanRepo = new InMemoryLoanRepository();
    installmentRepo = new InMemoryLoanInstallmentRepository();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new LoanService(loanRepo as any, installmentRepo as any);
  });

  describe('createLoan', () => {
    it('fixed: generates equal installments with zero interest', async () => {
      const params = makeLoan({ principalCents: 12000, mode: 'fixed', installmentsCount: 3, interestRate: null });
      
      const result = await service.createLoan(params);
      
      expect(result.loan.principalCents).toBe(12000);
      expect(result.installments).toHaveLength(3);
      
      // Fixed: equal principal, zero interest
      const installmentCents = 12000 / 3; // 4000 each
      result.installments.forEach(installment => {
        expect(installment.principalCents).toBe(installmentCents);
        expect(installment.interestCents).toBe(0);
        expect(installment.totalCents).toBe(installmentCents);
        expect(installment.status).toBe('pending');
        expect(installment.paidAt).toBeNull();
      });
    });

    it('price: generates PMT constant with interest component', async () => {
      // Price: principal=12000, rate=1% monthly, 3 installments
      // PMT = P * [r(1+r)^n] / [(1+r)^n - 1]
      // r = 0.01, (1+r)^3 = 1.030301, PMT ≈ 4060.35
      const params = makeLoan({ 
        principalCents: 12000, 
        mode: 'price', 
        installmentsCount: 3, 
        interestRate: 100, // 100 bp = 1%
        startDate: '2026-01-01T00:00:00.000Z',
      });
      
      const result = await service.createLoan(params);
      
      expect(result.loan.mode).toBe('price');
      expect(result.installments).toHaveLength(3);
      
      // All installments should have same total (PMT constant)
      const totals = result.installments.map(i => i.totalCents);
      expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1); // within 1 cent
      
      // In PRICE, first installment has mostly principal (interest is small on large balance)
      expect(result.installments[0].principalCents).toBeGreaterThan(result.installments[0].interestCents);
      
      // Last installment: mostly principal
      expect(result.installments[2].principalCents).toBeGreaterThan(result.installments[2].interestCents);
      
      // Sum of principals ≈ principalCents
      const sumPrincipal = result.installments.reduce((sum: number, i: any) => sum + i.principalCents, 0);
      expect(sumPrincipal).toBeCloseTo(12000, -2);
    });

    it('sac: generates decreasing installments (principal fixed, interest decreases)', async () => {
      // SAC: amort = P/n = 12000/3 = 4000
      // Installment 1: interest = 12000 * 0.01 = 120, total = 4120
      // Installment 2: interest = 8000 * 0.01 = 80, total = 4080
      // Installment 3: interest = 4000 * 0.01 = 40, total = 4040
      const params = makeLoan({
        principalCents: 12000,
        mode: 'sac',
        installmentsCount: 3,
        interestRate: 100, // 100 bp = 1%
      });
      
      const result = await service.createLoan(params);
      
      expect(result.installments).toHaveLength(3);
      
      // Principal is constant per installment (amortization = P/n)
      const amort = 12000 / 3; // 4000
      result.installments.forEach((i: any) => {
        expect(i.principalCents).toBe(amort);
      });
      
      // Interest decreases each month
      expect(result.installments[0].interestCents).toBeGreaterThan(result.installments[1].interestCents);
      expect(result.installments[1].interestCents).toBeGreaterThan(result.installments[2].interestCents);
      
      // Totals decrease
      expect(result.installments[0].totalCents).toBeGreaterThan(result.installments[1].totalCents);
      expect(result.installments[1].totalCents).toBeGreaterThan(result.installments[2].totalCents);
    });

    it('custom: generates empty installments (totalCents=0)', async () => {
      const params = makeLoan({ principalCents: 12000, mode: 'custom', installmentsCount: 3 });
      
      const result = await service.createLoan(params);
      
      expect(result.installments).toHaveLength(3);
      result.installments.forEach((installment: any) => {
        expect(installment.totalCents).toBe(0);
        expect(installment.principalCents).toBe(0);
        expect(installment.interestCents).toBe(0);
      });
    });

    it('creates loan with correct householdId and dates', async () => {
      const params = makeLoan({ householdId: 'house-123', name: 'Car Loan' });
      
      const result = await service.createLoan(params);
      
      expect(result.loan.householdId).toBe('house-123');
      expect(result.loan.name).toBe('Car Loan');
      expect(result.loan.createdAt).toBeDefined();
      expect(result.loan.updatedAt).toBeDefined();
    });
  });

  describe('payInstallment', () => {
    it('marks installment as paid with paidAt timestamp', async () => {
      // Create loan first
      const params = makeLoan({ principalCents: 12000, mode: 'fixed', installmentsCount: 1 });
      const { loan, installments } = await service.createLoan(params);
      
      const installment = installments[0];
      const paidAt = '2026-01-15T10:00:00.000Z';
      
      const result = await service.payInstallment({
        householdId: loan.householdId,
        installmentId: installment.id,
        paidAt,
      });
      
      expect(result.success).toBe(true);
      expect(result.installment?.status).toBe('paid');
      expect(result.installment?.paidAt).toBe(paidAt);
    });

    it('fails when installment not found', async () => {
      const result = await service.payInstallment({
        householdId: 'house-123',
        installmentId: 'non-existent-id',
        paidAt: '2026-01-15T10:00:00.000Z',
      });
      
      expect(result.success).toBe(false);
    });

    it('fails when householdId does not match', async () => {
      const params = makeLoan({ householdId: 'house-123', principalCents: 12000, mode: 'fixed', installmentsCount: 1 });
      const { installments } = await service.createLoan(params);
      
      const result = await service.payInstallment({
        householdId: 'different-house',
        installmentId: installments[0].id,
        paidAt: '2026-01-15T10:00:00.000Z',
      });
      
      expect(result.success).toBe(false);
    });
  });
});