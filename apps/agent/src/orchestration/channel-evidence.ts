/**
 * Production grounding wiring (AGENT-005).
 *
 * Builds the `evidenceProvider` / `correctionProvider` pair injected into
 * `ConversationOrchestrator` by `orchestratorForChannel` for every channel
 * (pwa-rest, sdk, broker).
 *
 * - The evidence provider maps `plan.domain` / `plan.requestedOperations`
 *   onto the canonical generated READ tools (never writes), scoped with the
 *   turn's workspace (`householdId = input.workspaceId`). Each read is
 *   fail-contained: transport or shape failures become a single `error`
 *   `EvidenceItem` for that source — fail-closed for the item, never
 *   invented data, never a thrown turn failure.
 * - The correction provider performs the single structured correction
 *   attempt required by `createGroundedResponseWithRetry`, reusing the same
 *   unified response mechanism as the initial provider call (ONE retry max
 *   is enforced by the orchestrator/grounded-response, not here).
 */

import { createEvidenceEnvelope, type EvidenceEnvelope, type EvidenceInput } from '../evidence/evidence-envelope.js';
import { generatedHttpTools } from '../generated/http-tools.js';
import { setGlobalApiContext } from '../tools/api-client.js';
import type { TurnInput, TurnPlan } from './conversation-orchestrator.js';

/** Callable canonical read: params in, projected API payload out. */
export type ChannelReadFn = (params: Record<string, unknown>) => Promise<unknown>;

/** Injectable read-tool seam (defaults bind the generated HTTP tools). */
export type ChannelReadTools = {
  listAccounts: ChannelReadFn;
  listRecentTransactions: ChannelReadFn;
  getMonthSummary: ChannelReadFn;
  listStatements: ChannelReadFn;
  listAccountsPayable: ChannelReadFn;
  listBudgets: ChannelReadFn;
  listGoals: ChannelReadFn;
  listCategories: ChannelReadFn;
};

const bindGenerated = (name: string): ChannelReadFn => {
  const tool = generatedHttpTools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`agent.evidence_tool_missing:${name}`);
  return (params) => tool.execute(params);
};

export const defaultChannelReadTools = (): ChannelReadTools => ({
  listAccounts: bindGenerated('list_accounts'),
  listRecentTransactions: bindGenerated('list_recent_transactions'),
  getMonthSummary: bindGenerated('get_month_summary'),
  listStatements: bindGenerated('list_statements'),
  listAccountsPayable: bindGenerated('list_accounts_payable'),
  listBudgets: bindGenerated('list_budgets'),
  listGoals: bindGenerated('list_goals'),
  listCategories: bindGenerated('list_categories'),
});

export type ChannelGroundingDeps = {
  /** Unified response mechanism (the same call used for the initial answer). */
  respond: (input: TurnInput, plan: TurnPlan) => Promise<string>;
  readTools?: ChannelReadTools;
  apiOrigin?: string;
  /**
   * Per-turn read credential. Generated read tools intentionally omit
   * `context` params (e.g. `householdId`) from the wire: the API scopes
   * reads from the delegated token claims (`financial.read` capability,
   * `workspace` claim). Absent = unauthenticated reads, which fail closed
   * into `error` items downstream.
   */
  readToken?: (input: TurnInput) => Promise<string | undefined>;
  /** Per-read budget; a slow read degrades to an `error` item, never a hang. */
  readTimeoutMs?: number;
};

export type ChannelGrounding = {
  evidenceProvider: (input: TurnInput, plan: TurnPlan) => Promise<EvidenceEnvelope | null>;
  correctionProvider: (input: TurnInput, plan: TurnPlan, unsupportedClaims: readonly string[]) => Promise<string | null>;
};

const DEFAULT_READ_TIMEOUT_MS = 3000;
const MAX_EVIDENCE_READS = 2;
const MAX_STATEMENT_ENTRIES = 20;

type ReadKind =
  | 'accounts'
  | 'transactions'
  | 'month-summary'
  | 'statements'
  | 'payables'
  | 'budgets'
  | 'goals'
  | 'categories';

/** Planned operation name → canonical read (intent-router aliases included). */
const OPERATION_TO_READ: Record<string, ReadKind> = {
  get_balance: 'accounts',
  list_accounts: 'accounts',
  list_transactions: 'transactions',
  list_recent_transactions: 'transactions',
  get_month_summary: 'month-summary',
  spending_insights: 'month-summary',
  list_statements: 'statements',
  get_statement_details: 'statements',
  list_cards: 'statements',
  list_payables: 'payables',
  list_accounts_payable: 'payables',
  check_payable_reminders: 'payables',
  list_budgets: 'budgets',
  check_budgets: 'budgets',
  budget_trends: 'budgets',
  list_goals: 'goals',
  list_categories: 'categories',
};

/** Domain fallback when no planned operation maps to a read. Null = no evidence (legacy pass-through). */
const DOMAIN_DEFAULT_READ: Record<string, ReadKind | null> = {
  accounts: 'accounts',
  transactions: 'transactions',
  cards: 'statements',
  payables: 'payables',
  budgets: 'budgets',
  goals: 'goals',
  categories: 'categories',
  memory: null,
  web: null,
  general: null,
};

const READ_SOURCE: Record<ReadKind, string> = {
  accounts: 'api.accounts',
  transactions: 'api.transactions',
  'month-summary': 'api.month-summary',
  statements: 'api.statements',
  payables: 'api.payables',
  budgets: 'api.budgets',
  goals: 'api.goals',
  categories: 'api.categories',
};

const selectReads = (plan: TurnPlan): readonly ReadKind[] => {
  const selected: ReadKind[] = [];
  for (const operation of plan.requestedOperations) {
    if (operation.kind !== 'read') continue;
    const kind = OPERATION_TO_READ[operation.name];
    if (kind && !selected.includes(kind)) selected.push(kind);
    if (selected.length >= MAX_EVIDENCE_READS) return selected;
  }
  const fallback = DOMAIN_DEFAULT_READ[plan.domain] ?? null;
  if (fallback && !selected.includes(fallback) && selected.length < MAX_EVIDENCE_READS) selected.push(fallback);
  return selected;
};

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`agent.evidence_timeout:${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const toCents = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  !!value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** Projected tool payloads carry the rows under a named key (or `items`). */
const pickRows = (result: unknown, keys: readonly string[]): readonly unknown[] => {
  if (Array.isArray(result)) return result;
  const record = asRecord(result);
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

const now = (): string => new Date().toISOString();

const errorItem = (kind: ReadKind, ref: string): EvidenceInput => ({
  ref,
  source: READ_SOURCE[kind],
  retrievedAt: now(),
  status: 'error',
  data: null,
});

const mapAccounts = (result: unknown): EvidenceInput[] => {
  const rows = pickRows(result, ['accounts', 'items']);
  if (rows.length === 0) {
    return [{ ref: 'accounts', source: READ_SOURCE.accounts, retrievedAt: now(), status: 'empty', data: [] }];
  }
  const items: EvidenceInput[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    const accountName = record && typeof record.accountName === 'string'
      ? record.accountName
      : record && typeof record.name === 'string'
        ? record.name
        : null;
    const balanceCents = record
      ? (toCents(record.balanceCents) ?? toCents(record.balance_cents) ?? toCents(record.balance))
      : null;
    if (accountName === null || balanceCents === null) continue;
    // Shape matches the orchestrator's deterministic balance renderer exactly.
    items.push({
      ref: `account:${typeof record?.id === 'string' ? record.id : accountName}`,
      source: READ_SOURCE.accounts,
      retrievedAt: now(),
      status: 'ok',
      data: { accountName, balanceCents },
    });
  }
  if (items.length === 0) return [errorItem('accounts', 'accounts')];
  return items;
};

const mapTransactions = (result: unknown): EvidenceInput[] => {
  const rows = pickRows(result, ['transactions', 'items']);
  const entries: Array<{ description: string; date: string; amountCents: number }> = [];
  for (const row of rows.slice(0, MAX_STATEMENT_ENTRIES)) {
    const record = asRecord(row);
    if (!record || typeof record.description !== 'string' || typeof record.date !== 'string') continue;
    const amountCents = toCents(record.amountCents) ?? toCents(record.amount_cents) ?? toCents(record.amount);
    if (amountCents === null) continue;
    // Shape matches the orchestrator's deterministic statement renderer exactly.
    entries.push({ description: record.description, date: record.date, amountCents });
  }
  if (entries.length === 0) {
    return [{
      ref: 'statement',
      source: READ_SOURCE.transactions,
      retrievedAt: now(),
      status: rows.length === 0 ? 'empty' : 'error',
      data: rows.length === 0 ? [] : null,
    }];
  }
  return [{ ref: 'statement', source: READ_SOURCE.transactions, retrievedAt: now(), status: 'ok', data: entries }];
};

/** Single-object reads (month summary, statements, payables, budgets, goals, categories). */
const mapSingleton = (kind: ReadKind, ref: string, result: unknown): EvidenceInput[] => {
  if (result === null || result === undefined) {
    return [{ ref, source: READ_SOURCE[kind], retrievedAt: now(), status: 'empty', data: [] }];
  }
  return [{ ref, source: READ_SOURCE[kind], retrievedAt: now(), status: 'ok', data: result }];
};

export const createChannelGrounding = (deps: ChannelGroundingDeps): ChannelGrounding => {
  const tools = deps.readTools ?? defaultChannelReadTools();
  const timeoutMs = deps.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS;

  const evidenceProvider = async (input: TurnInput, plan: TurnPlan): Promise<EvidenceEnvelope | null> => {
    const kinds = selectReads(plan);
    if (kinds.length === 0) return null;
    // Reads execute under the turn's API context (origin + per-turn
    // delegation when available) — the same scoping the model-tool path
    // uses. A missing/failed token stays unauthenticated and fails closed
    // into `error` items below.
    let readToken: string | undefined;
    try {
      readToken = await deps.readToken?.(input);
    } catch {
      readToken = undefined;
    }
    setGlobalApiContext({
      ...(deps.apiOrigin !== undefined ? { apiOrigin: deps.apiOrigin } : {}),
      ...(typeof readToken === 'string' && readToken ? { delegatedToken: readToken } : {}),
    });
    const householdId = input.workspaceId;
    const fetchers: Record<ReadKind, () => Promise<EvidenceInput[]>> = {
      accounts: async () => mapAccounts(await tools.listAccounts({ householdId })),
      transactions: async () => mapTransactions(await tools.listRecentTransactions({ householdId, limit: 20 })),
      'month-summary': async () => mapSingleton(
        'month-summary',
        'month-summary',
        await tools.getMonthSummary({ householdId, yearMonth: new Date().toISOString().slice(0, 7) }),
      ),
      statements: async () => mapSingleton('statements', 'statements', await tools.listStatements({ householdId })),
      payables: async () => mapSingleton('payables', 'payables', await tools.listAccountsPayable({ householdId })),
      budgets: async () => mapSingleton('budgets', 'budgets', await tools.listBudgets({ householdId })),
      goals: async () => mapSingleton('goals', 'goals', await tools.listGoals({ householdId })),
      categories: async () => mapSingleton('categories', 'categories', await tools.listCategories({ householdId })),
    };
    const settled = await Promise.all(kinds.map(async (kind) => {
      try {
        return await withTimeout(fetchers[kind](), timeoutMs, kind);
      } catch {
        // Fail-closed for the item: the orchestrator grounds against the
        // remaining evidence and falls back safe when nothing is usable.
        return [errorItem(kind, kind)];
      }
    }));
    try {
      return createEvidenceEnvelope(settled.flat(), {});
    } catch {
      return createEvidenceEnvelope([{
        ref: 'unavailable',
        source: 'tool',
        retrievedAt: now(),
        status: 'error',
        data: null,
      }], {});
    }
  };

  /**
   * ONE structured correction attempt reusing the unified response
   * mechanism. Returns null when there is nothing to correct or the retry
   * itself fails, letting the grounded path fall back safe.
   */
  const correctionProvider = async (
    input: TurnInput,
    plan: TurnPlan,
    unsupportedClaims: readonly string[],
  ): Promise<string | null> => {
    if (unsupportedClaims.length === 0) return null;
    const correctionInput: TurnInput = {
      ...input,
      text: `${input.text}\n\n[Correção de grounding: os trechos a seguir não têm suporte nos dados apurados e devem ser removidos ou substituídos apenas por dados apurados: ${unsupportedClaims.join('; ')}. Responda usando APENAS os dados apurados.]`,
    };
    try {
      const revised = await deps.respond(correctionInput, plan);
      return typeof revised === 'string' && revised.trim().length > 0 ? revised : null;
    } catch {
      return null;
    }
  };

  return { evidenceProvider, correctionProvider };
};
