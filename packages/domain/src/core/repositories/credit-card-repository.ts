import type { CreditCard, CreditCardUpdate } from '../entities/credit-card.js';

/**
 * Credit Card Repository Port (REQ-011)
 */
export interface ICreditCardRepository {
  create(card: CreditCard): Promise<CreditCard>;
  findById(id: string): Promise<CreditCard | null>;
  findByHouseholdId(householdId: string): Promise<CreditCard[]>;
  findActive(householdId: string): Promise<CreditCard[]>;
  update(id: string, update: CreditCardUpdate): Promise<CreditCard | null>;
}