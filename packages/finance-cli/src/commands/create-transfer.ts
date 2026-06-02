// ─────────────────────────────────────────────────────────────────────────────
// create-transfer command
// ─────────────────────────────────────────────────────────────────────────────

import { FinanceApiClient } from '../api-client.js';
import type { CliResult } from '../types.js';

interface CreateTransferArgs {
  household: string;
  fromAccount: string;
  toAccount: string;
  amountCents: number;
  description?: string;
  date: string;
  source?: string;
  idempotencyKey?: string;
  'dry-run'?: boolean;
}

export async function createTransferCommand(args: CreateTransferArgs, dryRun = false): Promise<CliResult> {
  if (!args.household) return { success: false, reason: '--household é obrigatório' };
  if (!args.fromAccount) return { success: false, reason: '--from-account é obrigatório' };
  if (!args.toAccount) return { success: false, reason: '--to-account é obrigatório' };
  if (!args.amountCents || args.amountCents <= 0) {
    return { success: false, reason: '--amount-cents deve ser um número positivo' };
  }
  if (!args.date) return { success: false, reason: '--date é obrigatório (YYYY-MM-DD)' };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    return { success: false, reason: '--date deve estar no formato YYYY-MM-DD' };
  }

  if (dryRun || args['dry-run']) {
    return { success: true, data: { validated: true, input: args } };
  }

  const client = new FinanceApiClient();
  return client.createTransfer({
    householdId: args.household,
    fromAccountId: args.fromAccount,
    toAccountId: args.toAccount,
    amountCents: args.amountCents,
    description: args.description,
    date: args.date,
    source: args.source,
    idempotencyKey: args.idempotencyKey,
  });
}

export function parseCreateTransferArgs(rawArgs: string[]): CreateTransferArgs {
  const args: CreateTransferArgs = {
    household: '',
    fromAccount: '',
    toAccount: '',
    amountCents: 0,
    date: '',
  };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--household' && rawArgs[i + 1]) args.household = rawArgs[++i];
    else if (arg === '--from-account' && rawArgs[i + 1]) args.fromAccount = rawArgs[++i];
    else if (arg === '--to-account' && rawArgs[i + 1]) args.toAccount = rawArgs[++i];
    else if (arg === '--amount-cents' && rawArgs[i + 1]) args.amountCents = parseInt(rawArgs[++i], 10);
    else if (arg === '--description' && rawArgs[i + 1]) args.description = rawArgs[++i];
    else if (arg === '--date' && rawArgs[i + 1]) args.date = rawArgs[++i];
    else if (arg === '--source' && rawArgs[i + 1]) args.source = rawArgs[++i];
    else if (arg === '--idempotency-key' && rawArgs[i + 1]) args.idempotencyKey = rawArgs[++i];
    else if (arg === '--dry-run') args['dry-run'] = true;
  }

  return args;
}