import type { Invoice } from '../core/entities/invoice.js';
import type { IInvoiceRepository } from '../core/repositories/invoice-repository.js';

export class InMemoryInvoiceRepository implements IInvoiceRepository {
  private invoices: Map<string, Invoice> = new Map();

  async create(invoice: Invoice): Promise<Invoice> {
    this.invoices.set(invoice.id, { ...invoice });
    return { ...invoice };
  }

  async findById(id: string): Promise<Invoice | null> {
    return this.invoices.get(id) ?? null;
  }

  async findByCardId(cardId: string): Promise<Invoice[]> {
    return Array.from(this.invoices.values())
      .filter(i => i.cardId === cardId)
      .sort((a, b) => a.periodYear - b.periodYear || a.periodMonth - b.periodMonth);
  }

  async findByCardAndPeriod(cardId: string, periodMonth: number, periodYear: number): Promise<Invoice | null> {
    return Array.from(this.invoices.values()).find(
      i => i.cardId === cardId && i.periodMonth === periodMonth && i.periodYear === periodYear
    ) ?? null;
  }

  async findOpenByCardId(cardId: string): Promise<Invoice | null> {
    return Array.from(this.invoices.values()).find(
      i => i.cardId === cardId && i.status === 'open'
    ) ?? null;
  }

  async findOpenInvoices(): Promise<Invoice[]> {
    return Array.from(this.invoices.values()).filter(i => i.status === 'open');
  }

  async update(
    id: string, 
    update: { status?: 'open' | 'closed' | 'paid'; totalCents?: number; paidAt?: string | null }
  ): Promise<Invoice | null> {
    const existing = this.invoices.get(id);
    if (!existing) return null;

    const updated: Invoice = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.invoices.set(id, updated);
    return { ...updated };
  }
}