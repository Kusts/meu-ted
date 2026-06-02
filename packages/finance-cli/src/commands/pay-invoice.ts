// ─────────────────────────────────────────────────────────────────────────────
// pay-invoice command
// ─────────────────────────────────────────────────────────────────────────────

import { FinanceApiClient } from '../api-client.js';
import type { CliResult } from '../types.js';

interface PayInvoiceArgs {
  household: string;
  invoice: string;
  amountCents: number;
  paymentDate: string;
  paymentAccount?: string;
  'dry-run'?: boolean;
}

export async function payInvoiceCommand(args: PayInvoiceArgs, dryRun = false): Promise<CliResult> {
  if (!args.household) return { success: false, reason: '--household é obrigatório' };
  if (!args.invoice) return { success: false, reason: '--invoice é obrigatório' };
  if (!args.amountCents || args.amountCents <= 0) {
    return { success: false, reason: '--amount-cents deve ser um número positivo' };
  }
  if (!args.paymentDate) return { success: false, reason: '--payment-date é obrigatório (YYYY-MM-DD)' };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.paymentDate)) {
    return { success: false, reason: '--payment-date deve estar no formato YYYY-MM-DD' };
  }

  if (dryRun || args['dry-run']) {
    return { success: true, data: { validated: true, input: args } };
  }

  const client = new FinanceApiClient();
  return client.payInvoice({
    householdId: args.household,
    invoiceId: args.invoice,
    amountCents: args.amountCents,
    paymentDate: args.paymentDate,
    paymentAccountId: args.paymentAccount,
  });
}

export function parsePayInvoiceArgs(rawArgs: string[]): PayInvoiceArgs {
  const args: PayInvoiceArgs = {
    household: '',
    invoice: '',
    amountCents: 0,
    paymentDate: '',
  };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--household' && rawArgs[i + 1]) args.household = rawArgs[++i];
    else if (arg === '--invoice' && rawArgs[i + 1]) args.invoice = rawArgs[++i];
    else if (arg === '--amount-cents' && rawArgs[i + 1]) args.amountCents = parseInt(rawArgs[++i], 10);
    else if (arg === '--payment-date' && rawArgs[i + 1]) args.paymentDate = rawArgs[++i];
    else if (arg === '--payment-account' && rawArgs[i + 1]) args.paymentAccount = rawArgs[++i];
    else if (arg === '--dry-run') args['dry-run'] = true;
  }

  return args;
}