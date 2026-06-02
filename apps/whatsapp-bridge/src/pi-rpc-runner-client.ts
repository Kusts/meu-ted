// ─────────────────────────────────────────────────────────────────────────────
// PiRpcRunner Adapter for WhatsApp Bridge
// Wraps PiRpcRunner to implement PiClient interface
// ─────────────────────────────────────────────────────────────────────────────

import type { PiClient } from './webhook-handler.js';
import { createPiRpcRunner } from '@pi-financeiro/pi-rpc-runner';
import { FinanceApiClient, type AccountBalance, type MonthSummary } from './finance-api-client.js';

export interface ReportFinanceApiClient {
  getCurrentMonthSummary(householdId: string): Promise<{ success: boolean; data?: MonthSummary; reason?: string }>;
  getAccountBalances(householdId: string): Promise<{ success: boolean; data?: AccountBalance[]; reason?: string }>;
}

export interface PiRpcRunnerClientOptions {
  enabled?: boolean;
  command?: string;
  args?: string[];
  timeoutMs?: number;
  cwd?: string;
  financeApiClient?: ReportFinanceApiClient;
}

/**
 * Detect if message is a current-month financial report request in PT-BR.
 */
function isCurrentMonthReportRequest(message: string): boolean {
  const lower = message.toLowerCase();
  const reportKeywords = ['relatório', 'relatorio', 'resumo', 'balanço', 'balanco'];
  const periodKeywords = ['mês', 'mes', 'esse mês', 'esse mes', 'este mês', 'este mes', 'desse mês', 'desse mes', 'deste mês', 'deste mes'];

  const hasReportKeyword = reportKeywords.some(kw => lower.includes(kw));
  if (!hasReportKeyword) return false;

  // If it's a report keyword alone (e.g., "dê-me um relatório"), treat as general report for current month
  if (periodKeywords.some(kw => lower.includes(kw))) return true;

  // Bare report request without period = current month report
  // Heuristic: if the message is short and only contains report words, assume current month
  const words = lower.split(/\s+/);
  const reportOnly = words.every(w => reportKeywords.some(kw => w.includes(kw)) || ['um', 'uma', 'o', 'a', 'de', 'desse', 'desta', 'me', 'para'].includes(w));
  return reportOnly && words.length < 10;
}

/**
 * Format cents to BRL string.
 */
function formatCents(cents: number): string {
  const formatted = (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  // Replace non-breaking space (NBSP, U+00A0) with regular space for WhatsApp compatibility
  return formatted.replace(/ /g, ' ');
}

/**
 * Format current month report as WhatsApp text.
 */
function formatCurrentMonthReport(
  summary: MonthSummary,
  balances: AccountBalance[]
): string {
  const lines: string[] = [];
  lines.push(`📊 Relatório de ${summary.month}`);
  lines.push('');
  lines.push(`Receitas: ${formatCents(summary.incomeCents)}`);
  lines.push(`Despesas: ${formatCents(summary.expenseCents)}`);
  if (summary.transferCents > 0) {
    lines.push(`Transferências: ${formatCents(summary.transferCents)}`);
  }
  lines.push(`Saldo: ${formatCents(summary.netCents)}`);
  lines.push(`(${summary.recordCount} registros)`);

  if (balances.length > 0) {
    lines.push('');
    lines.push('Contas:');
    for (const acc of balances) {
      lines.push(`${acc.accountName}: ${formatCents(acc.currentBalanceCents)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Adapter that wraps PiRpcRunner to implement PiClient interface
 */
export class PiRpcRunnerClient implements PiClient {
  private runner: ReturnType<typeof createPiRpcRunner> | null = null;
  private enabled: boolean;
  private financeApiClient: ReportFinanceApiClient;

  constructor(options: PiRpcRunnerClientOptions = {}) {
    this.enabled = options.enabled ?? false;
    this.financeApiClient = options.financeApiClient ?? new FinanceApiClient();

    if (this.enabled) {
      this.runner = createPiRpcRunner({
        piCommand: options.command ?? 'pi',
        piArgs: options.args ?? ['--mode', 'rpc'],
        cwd: options.cwd,
        timeoutMs: options.timeoutMs ?? 30000,
      });
      this.runner.start();
    }
  }

  async send(
    message: string,
    _senderPhone: string,
    context: { householdId: string; source: string; idempotencyKey?: string }
  ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }> {
    if (!this.enabled || !this.runner) {
      return { success: false, reason: 'Pi RPC não habilitado' };
    }

    try {
      if (isCurrentMonthReportRequest(message)) {
        return await this.createCurrentMonthReport(context.householdId);
      }

      const result = await this.runner.runPrompt({
        userMessage: message,
        householdId: context.householdId,
        source: context.source as 'whatsapp' | 'dashboard' | 'cron' | 'agent',
        idempotencyKey: context.idempotencyKey,
      });

      if (result.success) {
        return {
          success: true,
          data: { message: result.response ?? 'OK' },
        };
      }

      return {
        success: false,
        reason: result.error ?? 'Erro desconhecido',
      };
    } catch (error) {
      return {
        success: false,
        reason: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  private async createCurrentMonthReport(
    householdId: string
  ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }> {
    const summaryResult = await this.financeApiClient.getCurrentMonthSummary(householdId);
    if (!summaryResult.success || !summaryResult.data) {
      return { success: false, reason: summaryResult.reason ?? 'Erro ao gerar relatório' };
    }

    const balancesResult = await this.financeApiClient.getAccountBalances(householdId);
    const balances = balancesResult.success ? balancesResult.data ?? [] : [];
    return { success: true, data: { message: formatCurrentMonthReport(summaryResult.data, balances) } };
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  stop(): void {
    if (this.runner) {
      this.runner.stop();
      this.runner = null;
    }
  }
}

/**
 * Check if Pi RPC is enabled via environment
 */
function isPiRpcEnabled(): boolean {
  return process.env.PI_RPC_ENABLED === 'true';
}

/**
 * Factory to create PiClient based on environment
 */
export function createPiClient(options?: PiRpcRunnerClientOptions): PiClient {
  const enabled = options?.enabled ?? isPiRpcEnabled();
  
  if (!enabled) {
    return new FakePiClientWrapper();
  }

  return new PiRpcRunnerClient(options);
}

/**
 * Get Pi command from environment or use default
 */
export function getPiCommand(): string {
  return process.env.PI_RPC_COMMAND || 'pi';
}

/**
 * Get Pi args from environment or use default
 */
export function getPiArgs(): string[] {
  if (process.env.PI_RPC_ARGS) {
    return JSON.parse(process.env.PI_RPC_ARGS);
  }
  return ['--mode', 'rpc'];
}

/**
 * Get timeout from environment or use default
 */
export function getPiTimeoutMs(): number {
  return parseInt(process.env.PI_RPC_TIMEOUT_MS || '30000', 10);
}

/**
 * Fake Pi client wrapper that does nothing
 */
class FakePiClientWrapper implements PiClient {
  async send(
    _message: string,
    _senderPhone: string,
    _context: { householdId: string; source: string; idempotencyKey?: string }
  ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }> {
    return { success: false, reason: 'Pi RPC desabilitado em modo desenvolvimento' };
  }
}