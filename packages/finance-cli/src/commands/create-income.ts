// ─────────────────────────────────────────────────────────────────────────────
// create-income command
// ─────────────────────────────────────────────────────────────────────────────

import { FinanceApiClient } from '../api-client.js';
import type { CliResult } from '../types.js';

interface CreateIncomeArgs {
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

export async function createIncomeCommand(args: CreateIncomeArgs, dryRun = false): Promise<CliResult> {
  if (!args.household) return { success: false, reason: '--household é obrigatório' };
  if (!args.account) return { success: false, reason: '--account é obrigatório' };
  if (!args.amountCents || args.amountCents <= 0) {
    return { success: false, reason: '--amount-cents deve ser um número positivo' };
  }
  if (!args.description) return { success: false, reason: '--description é obrigatório' };
  if (!args.date) return { success: false, reason: '--date é obrigatório (YYYY-MM-DD)' };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    return { success: false, reason: '--date deve estar no formato YYYY-MM-DD' };
  }

  if (dryRun || args['dry-run']) {
    return { success: true, data: { validated: true, input: args } };
  }

  const client = new FinanceApiClient();
  return client.createIncome({
    householdId: args.household,
    accountId: args.account,
    amountCents: args.amountCents,
    description: args.description,
    date: args.date,
    categoryId: args.category,
    source: args.source,
    idempotencyKey: args.idempotencyKey,
  });
}

export function parseCreateIncomeArgs(rawArgs: string[]): CreateIncomeArgs {
  // Simple argument parsing for income
  const args: CreateIncomeArgs = {
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