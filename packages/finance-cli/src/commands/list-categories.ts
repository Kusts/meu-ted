// ─────────────────────────────────────────────────────────────────────────────
// list-categories command
// ─────────────────────────────────────────────────────────────────────────────

import { FinanceApiClient } from '../api-client.js';
import type { CliResult } from '../types.js';

interface ListCategoriesArgs {
  household: string;
  'dry-run'?: boolean;
}

export async function listCategoriesCommand(args: ListCategoriesArgs, dryRun = false): Promise<CliResult> {
  if (!args.household) return { success: false, reason: '--household é obrigatório' };

  if (dryRun || args['dry-run']) {
    return { success: true, data: { validated: true, input: args } };
  }

  const client = new FinanceApiClient();
  return client.listCategories(args.household);
}

export function parseListCategoriesArgs(rawArgs: string[]): ListCategoriesArgs {
  const args: ListCategoriesArgs = { household: '' };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--household' && rawArgs[i + 1]) args.household = rawArgs[++i];
    else if (arg === '--dry-run') args['dry-run'] = true;
  }

  return args;
}