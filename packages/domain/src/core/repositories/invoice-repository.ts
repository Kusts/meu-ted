import type { Invoice } from '../entities/invoice.js';

/**
 * Invoice Repository Port (REQ-039)
 * Unique constraint on (cardId, periodMonth, periodYear)
 */
export interface IInvoiceRepository {
  create(invoice: Invoice): Promise<Invoice>;
  findById(id: string): Promise<Invoice | null>;
  findByHouseholdId(householdId: string): Promise<Invoice[]>;
  findByCardId(cardId: string): Promise<Invoice[]>;
  findByCardAndPeriod(cardId: string, periodMonth: number, periodYear: number): Promise<Invoice | null>;
  findOpenByCardId(cardId: string): Promise<Invoice | null>;
  findOpenInvoices(): Promise<Invoice[]>;
  update(id: string, update: { status?: 'open' | 'closed' | 'paid'; totalCents?: number; paidAt?: string | null }): Promise<Invoice | null>;
}