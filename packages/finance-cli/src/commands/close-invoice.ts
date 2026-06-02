// ─────────────────────────────────────────────────────────────────────────────
// close-invoice command
// ─────────────────────────────────────────────────────────────────────────────

import { FinanceApiClient } from '../api-client.js';
import type { CliResult } from '../types.js';

interface CloseInvoiceArgs {
  household: string;
  invoice: string;
  'dry-run'?: boolean;
}

export async function closeInvoiceCommand(args: CloseInvoiceArgs, dryRun = false): Promise<CliResult> {
  if (!args.household) return { success: false, reason: '--household é obrigatório' };
  if (!args.invoice) return { success: false, reason: '--invoice é obrigatório' };

  if (dryRun || args['dry-run']) {
    return { success: true, data: { validated: true, input: args } };
  }

  const client = new FinanceApiClient();
  return client.closeInvoice({
    householdId: args.household,
    invoiceId: args.invoice,
  });
}

export function parseCloseInvoiceArgs(rawArgs: string[]): CloseInvoiceArgs {
  const args: CloseInvoiceArgs = { household: '', invoice: '' };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--household' && rawArgs[i + 1]) args.household = rawArgs[++i];
    else if (arg === '--invoice' && rawArgs[i + 1]) args.invoice = rawArgs[++i];
    else if (arg === '--dry-run') args['dry-run'] = true;
  }

  return args;
}