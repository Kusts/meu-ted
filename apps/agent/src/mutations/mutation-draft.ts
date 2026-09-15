/**
 * MutationDraft multi-turno (SPEC §7.8, §25.3.1, §25.3.2 — ADR-014).
 *
 * A MutationDraft preserves an INCOMPLETE financial intention across
 * clarification turns with ZERO financial authority: it is not a
 * PendingOperation, cannot execute, cannot generate attestation, and never
 * bypasses canonical validation (the API re-validates on propose).
 *
 * CAS SOUNDNESS RATIONALE: the Durable Object processes one input event at a
 * time (`FinanceChatAgent.messageConcurrency = "queue"` — single-event
 * serialization). The in-memory CAS below is a synchronous check-and-set, so
 * it cannot interleave inside one turn handler: exactly one concurrent
 * continuation wins `active → proposing`, losers observe the terminal state
 * and get deterministic `draft.already_consumed`. The SQL implementation
 * uses a single `UPDATE ... WHERE status = 'active'` statement (atomic at
 * the storage engine), so the same guarantee holds across DO restarts and
 * evictions. The CAS elects a single proposer; it does NOT make
 * draft + propose one transaction — the DO ↔ API boundary is closed by the
 * recoverable idempotent handoff (stable `proposalIdempotencyKey` + API
 * dedup), never by distributed atomicity.
 */

import type { MutationDraftChannelMessage, TedApprovalTool } from '@pi-finance/llm-contracts';
import { deriveIdempotencyKey } from '../tools/intention-ledger.js';

export const DRAFT_ALREADY_CONSUMED = 'draft.already_consumed';

export type MutationDraftStatus =
  | 'active'
  | 'proposing'
  | 'consumed'
  | 'discarded'
  | 'expired'
  | 'replaced';

/** Definitive propose outcome once the API answered authoritatively. */
export type DraftProposeOutcome = 'created' | 'existing' | 'rejected' | 'unknown';

export type DraftTool = TedApprovalTool;

export type MutationDraftResolvedArgs = Readonly<{
  kind: 'expense' | 'income';
  amountCents: number;
  description: string;
  date: string;
  categoryQuery?: string;
  accountId?: string;
  categoryId?: string;
  /**
   * T3.4 (SPEC §16): display-only entity labels resolved from the
   * authoritative lists at propose time. Never executed, never authority —
   * the API re-validates the canonical IDs. Optional so pre-existing
   * in-flight drafts keep working (card degrades to IDs/legacy shape).
   */
  accountName?: string;
  categoryName?: string;
}>;

export type MutationDraftRecord = Readonly<{
  draftId: string;
  workspaceId: string;
  actorId: string;
  deviceId: string | null;
  conversationId?: string;
  tool: DraftTool;
  resolvedArgs: MutationDraftResolvedArgs;
  missingFields: readonly string[];
  proposalIdempotencyKey: string;
  proposalId?: string;
  proposeOutcome?: DraftProposeOutcome;
  status: MutationDraftStatus;
  discardReason?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  /** Last turn that touched the draft — same-turn resend dedups on this. */
  lastIntentionId: string;
  /** Last clarification question — resent verbatim on same-turn redelivery. */
  lastQuestion: string;
}>;

export type DraftContext = Readonly<{
  workspaceId: string;
  actorId: string;
  deviceId: string | null;
  conversationId?: string;
}>;

export type DraftRecordPatch = Partial<
  Pick<
    MutationDraftRecord,
    | 'resolvedArgs'
    | 'missingFields'
    | 'proposalId'
    | 'proposeOutcome'
    | 'status'
    | 'discardReason'
    | 'updatedAt'
    | 'lastIntentionId'
    | 'lastQuestion'
  >
>;

export const DEFAULT_DRAFT_TTL_MS = 15 * 60_000;
export const DEFAULT_MAX_PROPOSE_ATTEMPTS = 2;

const sameContext = (draft: MutationDraftRecord, ctx: DraftContext): boolean =>
  draft.workspaceId === ctx.workspaceId &&
  draft.actorId === ctx.actorId &&
  (draft.deviceId ?? null) === (ctx.deviceId ?? null) &&
  (draft.conversationId ?? undefined) === (ctx.conversationId ?? undefined);

/** Stable draft identity: same turn redelivered → same draft, never a duplicate. */
export const deriveDraftId = (workspaceId: string, intentionId: string): string =>
  deriveIdempotencyKey(workspaceId, intentionId, 'mutation-draft');

/** Stable propose key: reused on EVERY re-emission (retry, restart, recovery). */
export const deriveProposalKey = (workspaceId: string, draftId: string, tool: DraftTool): string =>
  deriveIdempotencyKey(workspaceId, draftId, tool);

export const isExpired = (draft: MutationDraftRecord, nowMs: number): boolean =>
  Number.isFinite(Date.parse(draft.expiresAt)) && Date.parse(draft.expiresAt) <= nowMs;

export const buildDraftRecord = (input: {
  workspaceId: string;
  actorId: string;
  deviceId: string | null;
  conversationId?: string;
  intentionId: string;
  tool: DraftTool;
  resolvedArgs: MutationDraftResolvedArgs;
  missingFields: readonly string[];
  question: string;
  ttlMs?: number;
  nowMs?: number;
}): MutationDraftRecord => {
  const now = input.nowMs ?? Date.now();
  const draftId = deriveDraftId(input.workspaceId, input.intentionId);
  const stamp = new Date(now).toISOString();
  return Object.freeze({
    draftId,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    deviceId: input.deviceId,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    tool: input.tool,
    resolvedArgs: Object.freeze({ ...input.resolvedArgs }),
    missingFields: Object.freeze([...input.missingFields]),
    proposalIdempotencyKey: deriveProposalKey(input.workspaceId, draftId, input.tool),
    status: 'active' as const,
    createdAt: stamp,
    updatedAt: stamp,
    expiresAt: new Date(now + (input.ttlMs ?? DEFAULT_DRAFT_TTL_MS)).toISOString(),
    lastIntentionId: input.intentionId,
    lastQuestion: input.question,
  });
};

/**
 * Channel-facing clarification payload (ADR-014): identity-free, no
 * authority/attestation, no executable args — only what is missing and the
 * objective question.
 */
export const toChannelMessage = (
  draft: MutationDraftRecord,
  question?: string,
): MutationDraftChannelMessage =>
  Object.freeze({
    draftId: draft.draftId,
    tool: draft.tool,
    missingFields: [...draft.missingFields],
    question: question ?? draft.lastQuestion,
    expiresAt: draft.expiresAt,
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Agent-side canonical gate before propose (SPEC §7.4): registry semantics
 * checked locally, the API re-validates authoritatively. Never throws —
 * false means "clarify, never propose".
 */
export const validateCompleteArgs = (args: MutationDraftResolvedArgs): boolean => {
  if (args.kind !== 'expense' && args.kind !== 'income') return false;
  if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) return false;
  if (!args.description || !args.description.trim()) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) return false;
  if (!args.accountId || !UUID.test(args.accountId)) return false;
  if (!args.categoryId || !UUID.test(args.categoryId)) return false;
  return true;
};

/**
 * Classifies propose failures: 4xx validation/business rejections are
 * DEFINITIVE (no operation was created → discard); transport errors,
 * timeouts, 5xx, 408/425/429 are UNKNOWN (operation may exist → stay
 * `proposing`, inconclusive reply, retry with the same key).
 */
export const isDefinitiveProposeError = (error: unknown): boolean => {
  const status =
    (error as { statusCode?: unknown }).statusCode ?? (error as { status?: unknown }).status;
  if (typeof status !== 'number') return false;
  if (status === 408 || status === 425 || status === 429) return false;
  return status >= 400 && status < 500;
};

const CANCEL_RE = /\b(cancela|cancelar|desist)/i;
const RESET_RE = /esquece|deixa (pra l[aá]|quieto|isso)|na verdade|come[cç]a|recome[cç]a|nova inten/i;

export const isCancelText = (text: string): boolean => CANCEL_RE.test(text);
export const isResetText = (text: string): boolean => RESET_RE.test(text);

export interface MutationDraftStore {
  getOrCreate(record: MutationDraftRecord): { record: MutationDraftRecord; created: boolean };
  get(draftId: string): MutationDraftRecord | undefined;
  listActive(ctx: DraftContext, nowMs: number): MutationDraftRecord[];
  listProposing(ctx: DraftContext, nowMs: number): MutationDraftRecord[];
  findByIntention(ctx: DraftContext, intentionId: string): MutationDraftRecord | undefined;
  /** Atomic `from → to`; losers get `{ ok: false, current }` (deterministic). */
  cas(
    draftId: string,
    from: 'active',
    to: 'proposing',
    patch?: DraftRecordPatch,
  ): { ok: true; record: MutationDraftRecord } | { ok: false; current: MutationDraftRecord | undefined };
  update(draftId: string, patch: DraftRecordPatch): MutationDraftRecord | undefined;
  /** Marks stale `active` drafts `expired`; returns how many were closed. */
  expireStale(ctx: DraftContext, nowMs: number): number;
}

export class InMemoryMutationDraftStore implements MutationDraftStore {
  private readonly drafts = new Map<string, MutationDraftRecord>();
  private readonly byIntention = new Map<string, string>();

  getOrCreate(record: MutationDraftRecord): { record: MutationDraftRecord; created: boolean } {
    const existing = this.drafts.get(record.draftId);
    if (existing) return { record: existing, created: false };
    this.drafts.set(record.draftId, record);
    this.byIntention.set(`${record.workspaceId}:${record.lastIntentionId}`, record.draftId);
    return { record, created: true };
  }

  get(draftId: string): MutationDraftRecord | undefined {
    return this.drafts.get(draftId);
  }

  listActive(ctx: DraftContext, nowMs: number): MutationDraftRecord[] {
    return [...this.drafts.values()].filter(
      (draft) => draft.status === 'active' && sameContext(draft, ctx) && !isExpired(draft, nowMs),
    );
  }

  listProposing(ctx: DraftContext, nowMs: number): MutationDraftRecord[] {
    return [...this.drafts.values()].filter(
      (draft) => draft.status === 'proposing' && sameContext(draft, ctx) && !isExpired(draft, nowMs),
    );
  }

  findByIntention(ctx: DraftContext, intentionId: string): MutationDraftRecord | undefined {
    const draftId = this.byIntention.get(`${ctx.workspaceId}:${intentionId}`);
    if (!draftId) return undefined;
    const draft = this.drafts.get(draftId);
    return draft && sameContext(draft, ctx) ? draft : undefined;
  }

  cas(
    draftId: string,
    from: 'active',
    to: 'proposing',
    patch: DraftRecordPatch = {},
  ): { ok: true; record: MutationDraftRecord } | { ok: false; current: MutationDraftRecord | undefined } {
    // Synchronous check-and-set: inside one DO turn handler this cannot
    // interleave (single-event serialization), so exactly one continuation
    // wins; every loser observes the post-CAS state deterministically.
    const current = this.drafts.get(draftId);
    if (!current || current.status !== from) return { ok: false, current };
    const next = Object.freeze({ ...current, ...patch, status: to });
    this.drafts.set(draftId, next);
    if (patch.lastIntentionId && patch.lastIntentionId !== current.lastIntentionId) {
      this.byIntention.set(`${next.workspaceId}:${patch.lastIntentionId}`, draftId);
    }
    return { ok: true, record: next };
  }

  update(draftId: string, patch: DraftRecordPatch): MutationDraftRecord | undefined {
    const current = this.drafts.get(draftId);
    if (!current) return undefined;
    const next = Object.freeze({ ...current, ...patch });
    this.drafts.set(draftId, next);
    if (patch.lastIntentionId && patch.lastIntentionId !== current.lastIntentionId) {
      this.byIntention.set(`${next.workspaceId}:${patch.lastIntentionId}`, draftId);
    }
    return next;
  }

  expireStale(ctx: DraftContext, nowMs: number): number {
    let closed = 0;
    for (const draft of this.drafts.values()) {
      if (draft.status === 'active' && sameContext(draft, ctx) && isExpired(draft, nowMs)) {
        this.drafts.set(draft.draftId, Object.freeze({ ...draft, status: 'expired' as const }));
        closed += 1;
      }
    }
    return closed;
  }
}

type SqlExec = {
  exec<T>(query: string, ...bindings: unknown[]): Iterable<T>;
};

const rowToRecord = (row: Record<string, unknown>): MutationDraftRecord => {
  const record = {
    draftId: String(row.draft_id ?? ''),
    workspaceId: String(row.workspace_id ?? ''),
    actorId: String(row.actor_id ?? ''),
    deviceId: (row.device_id as string | null) ?? null,
    ...(typeof row.conversation_id === 'string' && row.conversation_id ? { conversationId: row.conversation_id } : {}),
    tool: String(row.tool ?? 'transactions.expense.create'),
    resolvedArgs: JSON.parse(String(row.resolved_args_json ?? '{}')),
    missingFields: JSON.parse(String(row.missing_fields_json ?? '[]')),
    proposalIdempotencyKey: String(row.proposal_idempotency_key ?? ''),
    ...(typeof row.proposal_id === 'string' && row.proposal_id ? { proposalId: row.proposal_id } : {}),
    ...(typeof row.propose_outcome === 'string' && row.propose_outcome ? { proposeOutcome: row.propose_outcome } : {}),
    status: String(row.status ?? 'active'),
    ...(typeof row.discard_reason === 'string' && row.discard_reason ? { discardReason: row.discard_reason } : {}),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    expiresAt: String(row.expires_at ?? ''),
    lastIntentionId: String(row.last_intention_id ?? ''),
    lastQuestion: String(row.last_question ?? ''),
  } as MutationDraftRecord;
  return Object.freeze(record);
};

export const initializeMutationDraftSchema = (sql: SqlExec): void => {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS mutation_drafts (
      draft_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      device_id TEXT,
      conversation_id TEXT,
      tool TEXT NOT NULL,
      resolved_args_json TEXT NOT NULL,
      missing_fields_json TEXT NOT NULL,
      proposal_idempotency_key TEXT NOT NULL,
      proposal_id TEXT,
      propose_outcome TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      discard_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_intention_id TEXT NOT NULL
    );
  `);
  sql.exec(`
    CREATE INDEX IF NOT EXISTS idx_mutation_drafts_context
    ON mutation_drafts (workspace_id, actor_id, status);
  `);
};

/** DO-storage-backed draft store (SQLite in the conversation DO). */
export class SqlMutationDraftStore implements MutationDraftStore {
  constructor(private readonly sql: SqlExec) {}

  private persist(record: MutationDraftRecord): void {
    this.sql.exec(
      `INSERT INTO mutation_drafts (draft_id, workspace_id, actor_id, device_id, conversation_id, tool, resolved_args_json, missing_fields_json, proposal_idempotency_key, proposal_id, propose_outcome, status, discard_reason, created_at, updated_at, expires_at, last_intention_id, last_question)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (draft_id) DO NOTHING`,
      record.draftId,
      record.workspaceId,
      record.actorId,
      record.deviceId,
      record.conversationId ?? null,
      record.tool,
      JSON.stringify(record.resolvedArgs),
      JSON.stringify([...record.missingFields]),
      record.proposalIdempotencyKey,
      record.proposalId ?? null,
      record.proposeOutcome ?? null,
      record.status,
      record.discardReason ?? null,
      record.createdAt,
      record.updatedAt,
      record.expiresAt,
      record.lastIntentionId,
      record.lastQuestion,
    );
  }

  private writeUpdate(draftId: string, record: MutationDraftRecord): void {
    this.sql.exec(
      `UPDATE mutation_drafts SET resolved_args_json = ?, missing_fields_json = ?, proposal_id = ?, propose_outcome = ?, status = ?, discard_reason = ?, updated_at = ?, last_intention_id = ?, last_question = ? WHERE draft_id = ?`,
      JSON.stringify(record.resolvedArgs),
      JSON.stringify([...record.missingFields]),
      record.proposalId ?? null,
      record.proposeOutcome ?? null,
      record.status,
      record.discardReason ?? null,
      record.updatedAt,
      record.lastIntentionId,
      record.lastQuestion,
      draftId,
    );
  }

  getOrCreate(record: MutationDraftRecord): { record: MutationDraftRecord; created: boolean } {
    const existing = this.get(record.draftId);
    if (existing) return { record: existing, created: false };
    try {
      this.persist(record);
    } catch {
      const raced = this.get(record.draftId);
      if (raced) return { record: raced, created: false };
      throw new Error('agent.draft_store_unavailable');
    }
    return { record, created: true };
  }

  get(draftId: string): MutationDraftRecord | undefined {
    const rows = [...this.sql.exec<Record<string, unknown>>(`SELECT * FROM mutation_drafts WHERE draft_id = ?`, draftId)];
    return rows.length > 0 && rows[0] ? rowToRecord(rows[0]) : undefined;
  }

  private listByStatus(ctx: DraftContext, nowMs: number, status: 'active' | 'proposing'): MutationDraftRecord[] {
    const rows = [
      ...this.sql.exec<Record<string, unknown>>(
        `SELECT * FROM mutation_drafts WHERE workspace_id = ? AND actor_id = ? AND status = ?`,
        ctx.workspaceId,
        ctx.actorId,
        status,
      ),
    ];
    return rows
      .map(rowToRecord)
      .filter((draft) => sameContext(draft, ctx) && !isExpired(draft, nowMs));
  }

  listActive(ctx: DraftContext, nowMs: number): MutationDraftRecord[] {
    return this.listByStatus(ctx, nowMs, 'active');
  }

  listProposing(ctx: DraftContext, nowMs: number): MutationDraftRecord[] {
    return this.listByStatus(ctx, nowMs, 'proposing');
  }

  findByIntention(ctx: DraftContext, intentionId: string): MutationDraftRecord | undefined {
    const rows = [
      ...this.sql.exec<Record<string, unknown>>(
        `SELECT * FROM mutation_drafts WHERE workspace_id = ? AND actor_id = ? AND last_intention_id = ? ORDER BY updated_at DESC LIMIT 1`,
        ctx.workspaceId,
        ctx.actorId,
        intentionId,
      ),
    ];
    const found = rows.length > 0 && rows[0] ? rowToRecord(rows[0]) : undefined;
    return found && sameContext(found, ctx) ? found : undefined;
  }

  cas(
    draftId: string,
    from: 'active',
    to: 'proposing',
    patch: DraftRecordPatch = {},
  ): { ok: true; record: MutationDraftRecord } | { ok: false; current: MutationDraftRecord | undefined } {
    // Single-statement atomicity at the storage engine: the status predicate
    // is evaluated inside the UPDATE, so concurrent continuations (across
    // restarts/evictions, where the in-memory guarantee no longer applies)
    // still elect exactly one winner.
    const current = this.get(draftId);
    if (!current) return { ok: false, current: undefined };
    const next = Object.freeze({ ...current, ...patch, status: to });
    this.writeUpdateWithStatusGuard(draftId, next, from);
    const verified = this.get(draftId);
    if (verified && verified.status === to && verified.lastIntentionId === next.lastIntentionId) {
      return { ok: true, record: verified };
    }
    return { ok: false, current: verified };
  }

  private writeUpdateWithStatusGuard(draftId: string, next: MutationDraftRecord, from: string): void {
    this.sql.exec(
      `UPDATE mutation_drafts SET resolved_args_json = ?, missing_fields_json = ?, proposal_id = ?, propose_outcome = ?, status = ?, discard_reason = ?, updated_at = ?, last_intention_id = ?, last_question = ? WHERE draft_id = ? AND status = ?`,
      JSON.stringify(next.resolvedArgs),
      JSON.stringify([...next.missingFields]),
      next.proposalId ?? null,
      next.proposeOutcome ?? null,
      next.status,
      next.discardReason ?? null,
      next.updatedAt,
      next.lastIntentionId,
      next.lastQuestion,
      draftId,
      from,
    );
  }

  update(draftId: string, patch: DraftRecordPatch): MutationDraftRecord | undefined {
    const current = this.get(draftId);
    if (!current) return undefined;
    const next = Object.freeze({ ...current, ...patch });
    this.writeUpdate(draftId, next);
    return next;
  }

  expireStale(ctx: DraftContext, nowMs: number): number {
    const stale = this.listByStatusRaw(ctx, 'active').filter((draft) => isExpired(draft, nowMs));
    for (const draft of stale) {
      this.writeUpdate(draft.draftId, Object.freeze({ ...draft, status: 'expired' as const }));
    }
    return stale.length;
  }

  private listByStatusRaw(ctx: DraftContext, status: string): MutationDraftRecord[] {
    const rows = [
      ...this.sql.exec<Record<string, unknown>>(
        `SELECT * FROM mutation_drafts WHERE workspace_id = ? AND actor_id = ? AND status = ?`,
        ctx.workspaceId,
        ctx.actorId,
        status,
      ),
    ];
    return rows.map(rowToRecord).filter((draft) => sameContext(draft, ctx));
  }
}

/** True when the context holds any draft that may still need a propose. */
export const hasRecoverableDraft = (store: MutationDraftStore, ctx: DraftContext, nowMs: number): boolean =>
  store.listActive(ctx, nowMs).length > 0 || store.listProposing(ctx, nowMs).length > 0;
