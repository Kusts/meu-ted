// ─────────────────────────────────────────────────────────────────────────────
// mark-reviewed command
// ─────────────────────────────────────────────────────────────────────────────

import { FinanceApiClient } from '../api-client.js';
import type { CliResult } from '../types.js';

interface MarkReviewedArgs {
  household: string;
  reviewEntry: string;
  action: string;
  'dry-run'?: boolean;
}

export async function markReviewedCommand(args: MarkReviewedArgs, dryRun = false): Promise<CliResult> {
  if (!args.household) return { success: false, reason: '--household é obrigatório' };
  if (!args.reviewEntry) return { success: false, reason: '--review-entry é obrigatório' };
  if (!args.action) return { success: false, reason: '--action é obrigatório (approve|reject)' };
  if (!['approve', 'reject'].includes(args.action)) {
    return { success: false, reason: '--action deve ser approve ou reject' };
  }

  if (dryRun || args['dry-run']) {
    return { success: true, data: { validated: true, input: args } };
  }

  const client = new FinanceApiClient();
  return client.markReviewed({
    householdId: args.household,
    reviewEntryId: args.reviewEntry,
    action: args.action as 'approve' | 'reject',
  });
}

export function parseMarkReviewedArgs(rawArgs: string[]): MarkReviewedArgs {
  const args: MarkReviewedArgs = { household: '', reviewEntry: '', action: '' };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--household' && rawArgs[i + 1]) args.household = rawArgs[++i];
    else if (arg === '--review-entry' && rawArgs[i + 1]) args.reviewEntry = rawArgs[++i];
    else if (arg === '--action' && rawArgs[i + 1]) args.action = rawArgs[++i];
    else if (arg === '--dry-run') args['dry-run'] = true;
  }

  return args;
}