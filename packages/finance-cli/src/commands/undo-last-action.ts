// ─────────────────────────────────────────────────────────────────────────────
// undo-last-action command
// ─────────────────────────────────────────────────────────────────────────────

import { FinanceApiClient } from '../api-client.js';
import type { CliResult } from '../types.js';

interface UndoLastActionArgs {
  household: string;
  record: string;
  'dry-run'?: boolean;
}

export async function undoLastActionCommand(args: UndoLastActionArgs, dryRun = false): Promise<CliResult> {
  if (!args.household) return { success: false, reason: '--household é obrigatório' };
  if (!args.record) return { success: false, reason: '--record é obrigatório' };

  if (dryRun || args['dry-run']) {
    return { success: true, data: { validated: true, input: args } };
  }

  const client = new FinanceApiClient();
  return client.undoRecord({
    householdId: args.household,
    recordId: args.record,
  });
}

export function parseUndoLastActionArgs(rawArgs: string[]): UndoLastActionArgs {
  const args: UndoLastActionArgs = { household: '', record: '' };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--household' && rawArgs[i + 1]) args.household = rawArgs[++i];
    else if (arg === '--record' && rawArgs[i + 1]) args.record = rawArgs[++i];
    else if (arg === '--dry-run') args['dry-run'] = true;
  }

  return args;
}