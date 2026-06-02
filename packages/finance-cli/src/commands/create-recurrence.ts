// ─────────────────────────────────────────────────────────────────────────────
// create-recurrence command
// ─────────────────────────────────────────────────────────────────────────────

import { FinanceApiClient } from '../api-client.js';
import type { CliResult } from '../types.js';

const VALID_PERIODS = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'];
const VALID_TARGET_TYPES = ['payable_bill', 'account_debit', 'card_charge'];

interface CreateRecurrenceArgs {
  household: string;
  description: string;
  amountCents: number;
  period: string;
  targetType: string;
  firstDate: string;
  account?: string;
  card?: string;
  category?: string;
  'dry-run'?: boolean;
}

export async function createRecurrenceCommand(args: CreateRecurrenceArgs, dryRun = false): Promise<CliResult> {
  if (!args.household) return { success: false, reason: '--household é obrigatório' };
  if (!args.description) return { success: false, reason: '--description é obrigatório' };
  if (!args.amountCents || args.amountCents <= 0) {
    return { success: false, reason: '--amount-cents deve ser um número positivo' };
  }
  if (!args.period) return { success: false, reason: `--period é obrigatório (${VALID_PERIODS.join(', ')})` };
  if (!VALID_PERIODS.includes(args.period)) {
    return { success: false, reason: `--period deve ser um de: ${VALID_PERIODS.join(', ')}` };
  }
  if (!args.targetType) return { success: false, reason: `--target-type é obrigatório (${VALID_TARGET_TYPES.join(', ')})` };
  if (!VALID_TARGET_TYPES.includes(args.targetType)) {
    return { success: false, reason: `--target-type deve ser um de: ${VALID_TARGET_TYPES.join(', ')}` };
  }
  if (!args.firstDate) return { success: false, reason: '--first-date é obrigatório (YYYY-MM-DD)' };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.firstDate)) {
    return { success: false, reason: '--first-date deve estar no formato YYYY-MM-DD' };
  }

  if (dryRun || args['dry-run']) {
    return { success: true, data: { validated: true, input: args } };
  }

  const client = new FinanceApiClient();
  return client.createRecurrence({
    householdId: args.household,
    description: args.description,
    amountCents: args.amountCents,
    period: args.period,
    targetType: args.targetType,
    firstDate: args.firstDate,
    accountId: args.account,
    cardId: args.card,
    categoryId: args.category,
  });
}

export function parseCreateRecurrenceArgs(rawArgs: string[]): CreateRecurrenceArgs {
  const args: CreateRecurrenceArgs = {
    household: '',
    description: '',
    amountCents: 0,
    period: '',
    targetType: '',
    firstDate: '',
  };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--household' && rawArgs[i + 1]) args.household = rawArgs[++i];
    else if (arg === '--description' && rawArgs[i + 1]) args.description = rawArgs[++i];
    else if (arg === '--amount-cents' && rawArgs[i + 1]) args.amountCents = parseInt(rawArgs[++i], 10);
    else if (arg === '--period' && rawArgs[i + 1]) args.period = rawArgs[++i];
    else if (arg === '--target-type' && rawArgs[i + 1]) args.targetType = rawArgs[++i];
    else if (arg === '--first-date' && rawArgs[i + 1]) args.firstDate = rawArgs[++i];
    else if (arg === '--account' && rawArgs[i + 1]) args.account = rawArgs[++i];
    else if (arg === '--card' && rawArgs[i + 1]) args.card = rawArgs[++i];
    else if (arg === '--category' && rawArgs[i + 1]) args.category = rawArgs[++i];
    else if (arg === '--dry-run') args['dry-run'] = true;
  }

  return args;
}