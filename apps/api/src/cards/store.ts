/**
 * Card store — interface for credit card read/write operations.
 *
 * Separated from WriteStore because card operations (statements,
 * installments, recurring purchases) are a distinct domain from
 * expense/income/transfer CRUD.
 */

import type { Account, Statement, StatementDetail, StatementPurchase, RecurringPurchase } from '../types/domain.js';

export type CardStore = {
  /** List credit-card accounts for a household (kind='credit_card'). */
  listCreditCardAccounts(householdId: string): Promise<Account[]>;

  /** List statements, optionally filtered by accountId. */
  listStatements(householdId: string, accountId?: string, opts?: {
    status?: string;
    limit?: number;
  }): Promise<Statement[]>;

  /** Get a statement with its purchases. */
  getStatementDetail(householdId: string, statementId: string): Promise<StatementDetail | null>;

  /** Register a single purchase on a credit card. Returns the created transaction. */
  createCardPurchase(householdId: string, input: {
    accountId: string;
    description: string;
    amountCents: number;
    date: string;
    categoryId?: string;
    installmentNumber?: number;
    installmentsTotal?: number;
  }): Promise<import('../types/domain.js').Transaction[]>;

  /** Register all installments of a purchase at once. */
  createCardInstallments(householdId: string, input: {
    accountId: string;
    description: string;
    totalAmountCents: number;
    purchaseDate: string;
    installmentsTotal: number;
    categoryId?: string;
  }): Promise<import('../types/domain.js').Transaction[]>;

  /** Create a recurring purchase on a credit card. */
  createRecurringPurchase(householdId: string, input: {
    accountId: string;
    description: string;
    amountCents: number;
    frequency: 'monthly' | 'quarterly' | 'yearly';
    startDate: string;
    endDate?: string;
    categoryId?: string;
  }): Promise<RecurringPurchase>;

  /** Pay (total or partial) a credit card statement. */
  payStatement(householdId: string, statementId: string, input: {
    amountCents: number;
    fromAccountId: string;
  }): Promise<Statement>;
};
