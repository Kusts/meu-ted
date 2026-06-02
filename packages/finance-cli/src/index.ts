// ─────────────────────────────────────────────────────────────────────────────
// Command Router - TED Finance CLI
// ─────────────────────────────────────────────────────────────────────────────

import { createExpenseCommand, parseCreateExpenseArgs } from './commands/create-expense.js';
import { createIncomeCommand, parseCreateIncomeArgs } from './commands/create-income.js';
import { createTransferCommand, parseCreateTransferArgs } from './commands/create-transfer.js';
import { createInstallmentPurchaseCommand, parseCreateInstallmentPurchaseArgs } from './commands/create-installment-purchase.js';
import { createRecurrenceCommand, parseCreateRecurrenceArgs } from './commands/create-recurrence.js';
import { payBillCommand, parsePayBillArgs } from './commands/pay-bill.js';
import { closeInvoiceCommand, parseCloseInvoiceArgs } from './commands/close-invoice.js';
import { payInvoiceCommand, parsePayInvoiceArgs } from './commands/pay-invoice.js';
import { getReportCommand, parseGetReportArgs } from './commands/get-report.js';
import { listAccountsCommand, parseListAccountsArgs } from './commands/list-accounts.js';
import { listCategoriesCommand, parseListCategoriesArgs } from './commands/list-categories.js';
import { markReviewedCommand, parseMarkReviewedArgs } from './commands/mark-reviewed.js';
import { undoLastActionCommand, parseUndoLastActionArgs } from './commands/undo-last-action.js';
import type { CliResult } from './types.js';

type CommandHandler = (args: unknown, dryRun?: boolean) => Promise<CliResult>;
type ArgumentParser = (rawArgs: string[]) => unknown;

interface Command {
  name: string;
  description: string;
  handler: CommandHandler;
  parseArgs: ArgumentParser;
}

const commands: Record<string, Command> = {
  'create-expense': {
    name: 'create-expense',
    description: 'Criar uma despesa',
    handler: createExpenseCommand as CommandHandler,
    parseArgs: parseCreateExpenseArgs,
  },
  'create-income': {
    name: 'create-income',
    description: 'Criar uma receita',
    handler: createIncomeCommand as CommandHandler,
    parseArgs: parseCreateIncomeArgs,
  },
  'create-transfer': {
    name: 'create-transfer',
    description: 'Criar uma transferência',
    handler: createTransferCommand as CommandHandler,
    parseArgs: parseCreateTransferArgs,
  },
  'create-installment-purchase': {
    name: 'create-installment-purchase',
    description: 'Criar compra parcelada',
    handler: createInstallmentPurchaseCommand as CommandHandler,
    parseArgs: parseCreateInstallmentPurchaseArgs,
  },
  'create-recurrence': {
    name: 'create-recurrence',
    description: 'Criar recorrência',
    handler: createRecurrenceCommand as CommandHandler,
    parseArgs: parseCreateRecurrenceArgs,
  },
  'pay-bill': {
    name: 'pay-bill',
    description: 'Pagar conta',
    handler: payBillCommand as CommandHandler,
    parseArgs: parsePayBillArgs,
  },
  'close-invoice': {
    name: 'close-invoice',
    description: 'Fechar fatura',
    handler: closeInvoiceCommand as CommandHandler,
    parseArgs: parseCloseInvoiceArgs,
  },
  'pay-invoice': {
    name: 'pay-invoice',
    description: 'Pagar fatura',
    handler: payInvoiceCommand as CommandHandler,
    parseArgs: parsePayInvoiceArgs,
  },
  'get-report': {
    name: 'get-report',
    description: 'Obter relatório',
    handler: getReportCommand as CommandHandler,
    parseArgs: parseGetReportArgs,
  },
  'list-accounts': {
    name: 'list-accounts',
    description: 'Listar contas',
    handler: listAccountsCommand as CommandHandler,
    parseArgs: parseListAccountsArgs,
  },
  'list-categories': {
    name: 'list-categories',
    description: 'Listar categorias',
    handler: listCategoriesCommand as CommandHandler,
    parseArgs: parseListCategoriesArgs,
  },
  'mark-reviewed': {
    name: 'mark-reviewed',
    description: 'Marcar entrada como revisada',
    handler: markReviewedCommand as CommandHandler,
    parseArgs: parseMarkReviewedArgs,
  },
  'undo-last-action': {
    name: 'undo-last-action',
    description: 'Desfazer última ação',
    handler: undoLastActionCommand as CommandHandler,
    parseArgs: parseUndoLastActionArgs,
  },
};

export function showHelp(): void {
  console.log('TED Finance CLI - Help');
  console.log('');
  console.log('Uso: ted-finance <comando> [opções]');
  console.log('');
  console.log('Comandos disponíveis:');
  console.log('');
  for (const [name, cmd] of Object.entries(commands)) {
    console.log(`  ${name.padEnd(25)} ${cmd.description}`);
  }
  console.log('');
  console.log('Opções globais:');
  console.log('  --dry-run              Valida sem executar');
  console.log('  --help                 Mostra esta ajuda');
  console.log('');
  console.log('Exemplos:');
  console.log('  ted-finance create-expense --household h123 --account a456 --amount-cents 3590 --description "carne" --date 2026-06-02');
  console.log('  ted-finance get-report --household h123 --type monthly-summary');
  console.log('  ted-finance list-accounts --household h123');
}

export async function runCommand(args: string[]): Promise<void> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    return;
  }

  const [commandName, ...commandArgs] = args;

  const command = commands[commandName];
  if (!command) {
    console.error(JSON.stringify({ success: false, reason: `Comando desconhecido: ${commandName}` }));
    process.exit(1);
  }

  try {
    const parsedArgs = command.parseArgs(commandArgs);
    const result = await command.handler(parsedArgs);
    console.log(JSON.stringify(result));

    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      reason: error instanceof Error ? error.message : 'Erro desconhecido',
    }));
    process.exit(1);
  }
}

export { commands, type Command };