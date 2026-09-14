/**
 * Approval Tool Contract registry (SPEC §7.5) — canonical source of contract
 * for each mutable tool of the V2 approval protocol.
 *
 * Each entry carries exactly:
 * { tool, inputSchema, approvalRequired, executor }
 *
 * - inputSchema instances are REUSED from writes/types.ts (never duplicated).
 * - Reconciliation effects (affectedTargets) are intentionally absent: they
 *   belong to the separate Mutation Effects Registry (SPEC §15.1.1, T3.2).
 * - Propose-route validation wiring is out of scope here (T1.4); this module
 *   exposes only the registry plus lookup/validation helpers.
 */
import type { z } from 'zod';
import { createExpenseInputSchema, createIncomeInputSchema } from '../writes/types.js';
import type { WriteStore } from '../writes/store.js';

export const APPROVAL_TOOL_IDS = [
  'transactions.expense.create',
  'transactions.income.create',
] as const;

export type ApprovalToolId = (typeof APPROVAL_TOOL_IDS)[number];

export type ApprovalToolExecutionContext = {
  writes: WriteStore;
  workspaceId: string;
  args: unknown;
  idempotencyKey: string;
};

export type ApprovalToolResult = { status: 'succeeded'; operationId: string };

export type ApprovalToolExecutor = (
  ctx: ApprovalToolExecutionContext,
) => Promise<ApprovalToolResult>;

export type ApprovalToolContract = {
  tool: ApprovalToolId;
  inputSchema: z.ZodTypeAny;
  approvalRequired: true;
  executor: ApprovalToolExecutor;
};

export const createToolNotAllowedError = (): Error & { code: 'tool.not_allowed' } => {
  const error = new Error('tool.not_allowed') as Error & { code: 'tool.not_allowed' };
  error.code = 'tool.not_allowed';
  return error;
};

const executeExpenseCreate: ApprovalToolExecutor = async ({
  writes,
  workspaceId,
  args,
  idempotencyKey,
}) => {
  const parsed = createExpenseInputSchema.safeParse(args);
  if (!parsed.success) throw new Error('validation.invalid_expense_arguments');
  const transaction = await writes.createExpense(workspaceId, parsed.data, { idempotencyKey });
  return { status: 'succeeded' as const, operationId: transaction.id };
};

const executeIncomeCreate: ApprovalToolExecutor = async ({
  writes,
  workspaceId,
  args,
  idempotencyKey,
}) => {
  const parsed = createIncomeInputSchema.safeParse(args);
  if (!parsed.success) throw new Error('validation.invalid_income_arguments');
  const transaction = await writes.createIncome(workspaceId, parsed.data, { idempotencyKey });
  return { status: 'succeeded' as const, operationId: transaction.id };
};

const CONTRACTS: Record<ApprovalToolId, ApprovalToolContract> = {
  'transactions.expense.create': {
    tool: 'transactions.expense.create',
    inputSchema: createExpenseInputSchema,
    approvalRequired: true,
    executor: executeExpenseCreate,
  },
  'transactions.income.create': {
    tool: 'transactions.income.create',
    inputSchema: createIncomeInputSchema,
    approvalRequired: true,
    executor: executeIncomeCreate,
  },
};

export const getApprovalToolContract = (tool: string): ApprovalToolContract | undefined =>
  (CONTRACTS as Record<string, ApprovalToolContract>)[tool];

export const requireApprovalToolContract = (tool: string): ApprovalToolContract => {
  const contract = getApprovalToolContract(tool);
  if (!contract) throw createToolNotAllowedError();
  return contract;
};

export type ApprovalToolArgsValidation =
  | { success: true; data: unknown }
  | { success: false; code: 'tool.not_allowed' | 'validation.invalid_arguments'; issues?: unknown };

export const validateApprovalToolArgs = (
  tool: string,
  args: unknown,
): ApprovalToolArgsValidation => {
  const contract = getApprovalToolContract(tool);
  if (!contract) return { success: false, code: 'tool.not_allowed' };
  const parsed = contract.inputSchema.safeParse(args);
  if (!parsed.success) {
    return { success: false, code: 'validation.invalid_arguments', issues: parsed.error.issues };
  }
  return { success: true, data: parsed.data };
};
