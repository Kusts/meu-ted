/**
 * INV-09 remediation: MutationDraft persistence against a REAL SQLite
 * database (node:sqlite, same adapter shape as the DO storage shim and the
 * existing agent-privacy-sqlite tests).
 *
 * Covers: fresh schema init → create draft → persist with `last_question` →
 * load → CAS active→proposing → consumed; plus the "old schema" simulation
 * (table created WITHOUT the column, as on pre-fix DOs) → idempotent
 * migration applies → persist works and legacy rows survive.
 */
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  buildDraftRecord,
  initializeMutationDraftSchema,
  SqlMutationDraftStore,
} from '../../src/mutations/mutation-draft.js';

type SqlShim = {
  exec<T>(query: string, ...bindings: unknown[]): Iterable<T>;
};

const createSql = (): { db: DatabaseSync; sql: SqlShim } => {
  const db = new DatabaseSync(':memory:');
  const sql: SqlShim = {
    exec<T>(query: string, ...bindings: unknown[]): Iterable<T> {
      const statement = db.prepare(query);
      if (/^\s*(SELECT|PRAGMA|WITH)/i.test(query)) {
        return statement.all(...(bindings as never[])) as T[];
      }
      statement.run(...(bindings as never[]));
      return [] as T[];
    },
  };
  return { db, sql };
};

const draftInput = (intentionId: string, question: string) => ({
  workspaceId: 'ws-1',
  actorId: 'actor-1',
  deviceId: null,
  intentionId,
  tool: 'transactions.expense.create' as const,
  resolvedArgs: {
    kind: 'expense' as const,
    amountCents: 5000,
    description: 'mercado',
    date: '2026-09-14',
  },
  missingFields: ['accountId'] as readonly string[],
  question,
});

const ctx = { workspaceId: 'ws-1', actorId: 'actor-1', deviceId: null };

describe('SqlMutationDraftStore on real SQLite (INV-09)', () => {
  it('fresh init → persist with last_question → load → CAS → consumed', () => {
    const { sql } = createSql();
    initializeMutationDraftSchema(sql);
    const columns = [
      ...sql.exec<Record<string, unknown>>(`PRAGMA table_info(mutation_drafts)`),
    ].map((row) => String(row.name));
    expect(columns).toContain('last_question');

    const store = new SqlMutationDraftStore(sql);
    const record = buildDraftRecord(draftInput('intent-1', 'Qual conta usar?'));
    expect(store.getOrCreate(record)).toMatchObject({ created: true });

    const loaded = store.get(record.draftId);
    expect(loaded?.lastQuestion).toBe('Qual conta usar?');
    expect(loaded?.status).toBe('active');

    const updated = store.update(record.draftId, { lastQuestion: 'Nubank ou Itaú?' });
    expect(updated?.lastQuestion).toBe('Nubank ou Itaú?');

    const cas = store.cas(record.draftId, 'active', 'proposing');
    expect(cas.ok).toBe(true);

    const consumed = store.update(record.draftId, { status: 'consumed' });
    expect(consumed?.status).toBe('consumed');
    expect(store.get(record.draftId)?.status).toBe('consumed');

    // Schema init is idempotent — re-running never throws or wipes rows.
    initializeMutationDraftSchema(sql);
    expect(store.get(record.draftId)?.lastQuestion).toBe('Nubank ou Itaú?');
  });

  it('old schema without the column → migration applies → persist works, legacy rows survive', () => {
    const { sql } = createSql();
    // Simulate a pre-fix DO: table created WITHOUT `last_question`.
    sql.exec(`
      CREATE TABLE mutation_drafts (
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
    sql.exec(
      `INSERT INTO mutation_drafts (draft_id, workspace_id, actor_id, tool, resolved_args_json, missing_fields_json, proposal_idempotency_key, status, created_at, updated_at, expires_at, last_intention_id)
       VALUES ('legacy-1', 'ws-1', 'actor-1', 'transactions.expense.create', '{}', '[]', 'key-legacy', 'active', '2026-09-14T00:00:00.000Z', '2026-09-14T00:00:00.000Z', '2999-01-01T00:00:00.000Z', 'intent-legacy')`,
    );

    // Before the fix this persist threw a SQLite "no such column" error.
    initializeMutationDraftSchema(sql);
    const store = new SqlMutationDraftStore(sql);

    const legacy = store.get('legacy-1');
    expect(legacy?.draftId).toBe('legacy-1');
    expect(legacy?.lastQuestion).toBe('');

    const record = buildDraftRecord(draftInput('intent-new', 'Primeira pergunta?'));
    expect(store.getOrCreate(record).created).toBe(true);
    expect(store.get(record.draftId)?.lastQuestion).toBe('Primeira pergunta?');

    // Legacy rows stay queryable in the same context.
    expect(store.listActive(ctx, Date.now()).map((draft) => draft.draftId).sort()).toEqual([
      'legacy-1',
      record.draftId,
    ].sort());
  });
});
