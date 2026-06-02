// ─────────────────────────────────────────────────────────────────────────────
// create-expense command
// ─────────────────────────────────────────────────────────────────────────────

import { FinanceApiClient } from '../api-client.js';
import type { CliResult } from '../types.js';

const VALID_SOURCES = ['whatsapp', 'dashboard', 'cron', 'agent'];

interface CreateExpenseArgs {
  household: string;
  account: string;
  amountCents: number;
  description: string;
  date: string;
  category?: string;
  source?: string;
  idempotencyKey?: string;
  'dry-run'?: boolean;
}

export async function createExpenseCommand(args: CreateExpenseArgs, dryRun = false): Promise<CliResult> {
  // Validate required fields
  if (!args.household) {
    return { success: false, reason: '--household é obrigatório' };
  }
  if (!args.account) {
    return { success: false, reason: '--account é obrigatório' };
  }
  if (!args.amountCents || args.amountCents <= 0) {
    return { success: false, reason: '--amount-cents deve ser um número positivo' };
  }
  if (!args.description) {
    return { success: false, reason: '--description é obrigatório' };
  }
  if (!args.date) {
    return { success: false, reason: '--date é obrigatório (YYYY-MM-DD)' };
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    return { success: false, reason: '--date deve estar no formato YYYY-MM-DD' };
  }

  // Validate source if provided
  if (args.source && !VALID_SOURCES.includes(args.source)) {
    return { success: false, reason: `--source deve ser um de: ${VALID_SOURCES.join(', ')}` };
  }

  // Dry run - just validate
  if (dryRun || args['dry-run']) {
    return {
      success: true,
      data: {
        validated: true,
        input: {
          householdId: args.household,
          accountId: args.account,
          amountCents: args.amountCents,
          description: args.description,
          date: args.date,
          categoryId: args.category,
          source: args.source || 'agent',
          idempotencyKey: args.idempotencyKey,
        },
      },
    };
  }

  // Execute
  const client = new FinanceApiClient();
  const result = await client.createExpense({
    householdId: args.household,
    accountId: args.account,
    amountCents: args.amountCents,
    description: args.description,
    date: args.date,
    categoryId: args.category,
    source: args.source,
    idempotencyKey: args.idempotencyKey,
  });

  return result;
}

export function parseCreateExpenseArgs(rawArgs: string[]): CreateExpenseArgs {
  const args: CreateExpenseArgs = {
    household: '',
    account: '',
    amountCents: 0,
    description: '',
    date: '',
  };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--household' && rawArgs[i + 1]) args.household = rawArgs[++i];
    else if (arg === '--account' && rawArgs[i + 1]) args.account = rawArgs[++i];
    else if (arg === '--amount-cents' && rawArgs[i + 1]) args.amountCents = parseInt(rawArgs[++i], 10);
    else if (arg === '--description' && rawArgs[i + 1]) args.description = rawArgs[++i];
    else if (arg === '--date' && rawArgs[i + 1]) args.date = rawArgs[++i];
    else if (arg === '--category' && rawArgs[i + 1]) args.category = rawArgs[++i];
    else if (arg === '--source' && rawArgs[i + 1]) args.source = rawArgs[++i];
    else if (arg === '--idempotency-key' && rawArgs[i + 1]) args.idempotencyKey = rawArgs[++i];
    else if (arg === '--dry-run') args['dry-run'] = true;
  }

  return args;
}