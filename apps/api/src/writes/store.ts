/**
 * WriteStore — interface for mutating V1 financial data.
 *
 * Every method receives `householdId` server-derived from the device
 * token. The store enforces that the entity exists and belongs to the
 * household. House-rule invariants (e.g. "cannot deactivate account
 * with active transactions") live here so both backends share the
 * same behavior.
 */

import type { Account, Category, Transaction } from '../types/domain.js';
import type {
  CreateAccountInput,
  CreateCategoryInput,
  CreateExpenseInput,
  CreateIncomeInput,
  CreateTransferInput,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateTransactionInput,
} from './types.js';

export type { Transaction };

export type WriteStore = {
  // accounts
  createAccount(householdId: string, input: CreateAccountInput): Promise<Account>;
  updateAccount(householdId: string, id: string, patch: UpdateAccountInput): Promise<Account>;
  deactivateAccount(householdId: string, id: string): Promise<Account>;

  // categories
  createCategory(householdId: string, input: CreateCategoryInput): Promise<Category>;
  updateCategory(householdId: string, id: string, patch: UpdateCategoryInput): Promise<Category>;
  deactivateCategory(householdId: string, id: string): Promise<Category>;

  // transactions
  createExpense(householdId: string, input: CreateExpenseInput): Promise<Transaction>;
  createIncome(householdId: string, input: CreateIncomeInput): Promise<Transaction>;
  createTransfer(householdId: string, input: CreateTransferInput): Promise<Transaction>;
  updateTransaction(householdId: string, id: string, patch: UpdateTransactionInput): Promise<Transaction>;
  softDeleteTransaction(householdId: string, id: string): Promise<Transaction>;
};
