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
  DeleteCategoryInput,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateTransactionInput,
} from './types.js';

export type { Transaction };

export type ApplyDefaultsResult = { created: number; skipped: number };

export type DeleteCategoryResult = {
  deletedCategoryIds: string[];
  movedTransactions: number;
  softDeletedTransactions: number;
};

/**
 * P1 (audit item 7): key-idempotent execution for V2 pending operations.
 *
 * When present, the mutation executes AT MOST ONCE per
 * (household, idempotencyKey): the first call executes and records
 * (key → result); concurrent or repeated calls with the same key and
 * payload return the recorded result without re-executing. Same key
 * with a different payload conflicts (409 idempotency.conflict).
 */
export type WriteIdempotencyOptions = {
  idempotencyKey?: string;
};

export type WriteStore = {
  // accounts
  createAccount(householdId: string, input: CreateAccountInput): Promise<Account>;
  updateAccount(householdId: string, id: string, patch: UpdateAccountInput): Promise<Account>;
  deactivateAccount(householdId: string, id: string): Promise<Account>;

  // categories
  createCategory(householdId: string, input: CreateCategoryInput): Promise<Category>;
  updateCategory(householdId: string, id: string, patch: UpdateCategoryInput): Promise<Category>;
  deactivateCategory(householdId: string, id: string): Promise<Category>;
  /**
   * Hard-removes a macro (and its subs) from the active set. mode 'move'
   * reassigns every referencing transaction to destinationCategoryId;
   * mode 'cascade' (confirm:true required) soft-deletes them instead.
   * Never leaves a transaction pointing at a deactivated category.
   */
  deleteCategory(householdId: string, id: string, input: DeleteCategoryInput): Promise<DeleteCategoryResult>;
  /**
   * Applies the pt-BR default catalog to the household. Idempotent:
   * existing same-kind macros (case-insensitive name match) are reused
   * and counted as skipped with their subs.
   */
  applyCategoryDefaults(householdId: string): Promise<ApplyDefaultsResult>;

  // transactions
  createExpense(householdId: string, input: CreateExpenseInput, options?: WriteIdempotencyOptions): Promise<Transaction>;
  createIncome(householdId: string, input: CreateIncomeInput, options?: WriteIdempotencyOptions): Promise<Transaction>;
  createTransfer(householdId: string, input: CreateTransferInput): Promise<Transaction>;
  updateTransaction(householdId: string, id: string, patch: UpdateTransactionInput): Promise<Transaction>;
  softDeleteTransaction(householdId: string, id: string): Promise<Transaction>;
};
