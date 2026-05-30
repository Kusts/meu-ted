import type { CreditCard, CreditCardUpdate } from '../core/entities/credit-card.js';
import type { ICreditCardRepository } from '../core/repositories/credit-card-repository.js';

export class InMemoryCreditCardRepository implements ICreditCardRepository {
  private cards: Map<string, CreditCard> = new Map();

  async create(card: CreditCard): Promise<CreditCard> {
    this.cards.set(card.id, { ...card });
    return { ...card };
  }

  async findById(id: string): Promise<CreditCard | null> {
    return this.cards.get(id) ?? null;
  }

  async findByHouseholdId(householdId: string): Promise<CreditCard[]> {
    return Array.from(this.cards.values()).filter(c => c.householdId === householdId);
  }

  async findActive(householdId: string): Promise<CreditCard[]> {
    return Array.from(this.cards.values()).filter(c => c.householdId === householdId && c.active);
  }

  async update(id: string, update: CreditCardUpdate): Promise<CreditCard | null> {
    const existing = this.cards.get(id);
    if (!existing) return null;

    const updated: CreditCard = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.cards.set(id, updated);
    return { ...updated };
  }
}