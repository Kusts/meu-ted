// ─────────────────────────────────────────────────────────────────────────────
// create-installment-purchase command
// ─────────────────────────────────────────────────────────────────────────────

import { FinanceApiClient } from '../api-client.js';
import type { CliResult } from '../types.js';

interface CreateInstallmentPurchaseArgs {
  household: string;
  card: string;
  amountCents: number;
  description: string;
  installments: number;
  firstDate: string;
  category?: string;
  source?: string;
  'dry-run'?: boolean;
}

export async function createInstallmentPurchaseCommand(args: CreateInstallmentPurchaseArgs, dryRun = false): Promise<CliResult> {
  if (!args.household) return { success: false, reason: '--household é obrigatório' };
  if (!args.card) return { success: false, reason: '--card é obrigatório' };
  if (!args.amountCents || args.amountCents <= 0) {
    return { success: false, reason: '--amount-cents deve ser um número positivo' };
  }
  if (!args.description) return { success: false, reason: '--description é obrigatório' };
  if (!args.installments || args.installments < 2) {
    return { success: false, reason: '--installments deve ser >= 2' };
  }
  if (!args.firstDate) return { success: false, reason: '--first-date é obrigatório (YYYY-MM-DD)' };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.firstDate)) {
    return { success: false, reason: '--first-date deve estar no formato YYYY-MM-DD' };
  }

  if (dryRun || args['dry-run']) {
    return { success: true, data: { validated: true, input: args } };
  }

  const client = new FinanceApiClient();
  return client.createInstallmentPurchase({
    householdId: args.household,
    cardId: args.card,
    amountCents: args.amountCents,
    description: args.description,
    installmentsCount: args.installments,
    firstDate: args.firstDate,
    categoryId: args.category,
    source: args.source,
  });
}

export function parseCreateInstallmentPurchaseArgs(rawArgs: string[]): CreateInstallmentPurchaseArgs {
  const args: CreateInstallmentPurchaseArgs = {
    household: '',
    card: '',
    amountCents: 0,
    description: '',
    installments: 0,
    firstDate: '',
  };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--household' && rawArgs[i + 1]) args.household = rawArgs[++i];
    else if (arg === '--card' && rawArgs[i + 1]) args.card = rawArgs[++i];
    else if (arg === '--amount-cents' && rawArgs[i + 1]) args.amountCents = parseInt(rawArgs[++i], 10);
    else if (arg === '--description' && rawArgs[i + 1]) args.description = rawArgs[++i];
    else if (arg === '--installments' && rawArgs[i + 1]) args.installments = parseInt(rawArgs[++i], 10);
    else if (arg === '--first-date' && rawArgs[i + 1]) args.firstDate = rawArgs[++i];
    else if (arg === '--category' && rawArgs[i + 1]) args.category = rawArgs[++i];
    else if (arg === '--source' && rawArgs[i + 1]) args.source = rawArgs[++i];
    else if (arg === '--dry-run') args['dry-run'] = true;
  }

  return args;
}