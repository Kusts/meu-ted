// ─────────────────────────────────────────────────────────────────────────────
// get-report command
// ─────────────────────────────────────────────────────────────────────────────

import { FinanceApiClient } from '../api-client.js';
import type { CliResult } from '../types.js';

const VALID_REPORT_TYPES = ['monthly-summary', 'category-breakdown', 'account-balances'];

interface GetReportArgs {
  household: string;
  type: string;
  dateFrom?: string;
  dateTo?: string;
  'dry-run'?: boolean;
}

export async function getReportCommand(args: GetReportArgs, dryRun = false): Promise<CliResult> {
  if (!args.household) return { success: false, reason: '--household é obrigatório' };
  if (!args.type) return { success: false, reason: `--type é obrigatório (${VALID_REPORT_TYPES.join(', ')})` };
  if (!VALID_REPORT_TYPES.includes(args.type)) {
    return { success: false, reason: `--type deve ser um de: ${VALID_REPORT_TYPES.join(', ')}` };
  }

  if (args.dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(args.dateFrom)) {
    return { success: false, reason: '--date-from deve estar no formato YYYY-MM-DD' };
  }
  if (args.dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(args.dateTo)) {
    return { success: false, reason: '--date-to deve estar no formato YYYY-MM-DD' };
  }

  if (dryRun || args['dry-run']) {
    return { success: true, data: { validated: true, input: args } };
  }

  const client = new FinanceApiClient();
  return client.getReport({
    householdId: args.household,
    type: args.type,
    dateFrom: args.dateFrom,
    dateTo: args.dateTo,
  });
}

export function parseGetReportArgs(rawArgs: string[]): GetReportArgs {
  const args: GetReportArgs = { household: '', type: '' };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--household' && rawArgs[i + 1]) args.household = rawArgs[++i];
    else if (arg === '--type' && rawArgs[i + 1]) args.type = rawArgs[++i];
    else if (arg === '--date-from' && rawArgs[i + 1]) args.dateFrom = rawArgs[++i];
    else if (arg === '--date-to' && rawArgs[i + 1]) args.dateTo = rawArgs[++i];
    else if (arg === '--dry-run') args['dry-run'] = true;
  }

  return args;
}