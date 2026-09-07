/**
 * Persistent memory (Part B, item 15): workspace- and actor-scoped durable
 * memories in the DO SQLite database.
 *
 * - Table `agent_memory`: id, workspace_id, actor, kind
 *   (fact|preference|learning|summary), content, salience, created_at,
 *   last_seen_at, expires_at (nullable).
 * - Table `agent_prefs`: per-workspace privacy toggle (ON by default).
 * - NEVER persists secrets or card numbers: card-like digit runs refuse
 *   the write; secret patterns go through `redactTranscript` first.
 * - Recall ranks by salience × recency-decay + keyword overlap, top-K
 *   within a fixed char budget for prompt injection via CognitiveHooks.
 */

import { randomUUID } from 'node:crypto';
import { redactTranscript } from '../../transcript-safety.js';

export type MemorySql = {
  exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): Iterable<T>;
};

export type MemoryKind = 'fact' | 'preference' | 'learning' | 'summary';

export type MemoryItem = {
  id: string;
  workspaceId: string;
  actor: string;
  kind: MemoryKind;
  content: string;
  salience: number;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string | null;
};

export const MEMORY_BUDGET_CHARS = 1200;
export const MEMORY_RECALL_LIMIT = 5;
export const MEMORY_SIMILARITY_THRESHOLD = 0.55;

/** 15–16 digit runs (with optional separators): never persisted. */
const CARD_NUMBER_RE = /\b(?:\d[ -]?){15,16}\b/;

export const containsCardNumber = (text: string): boolean => CARD_NUMBER_RE.test(text ?? '');

export const sanitizeMemoryContent = (raw: string): string => redactTranscript((raw ?? '').trim());

const nowIso = (): string => new Date().toISOString();

export const initializeMemorySchema = (sql: MemorySql): void => {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS agent_memory (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'fact',
      content TEXT NOT NULL,
      salience REAL NOT NULL DEFAULT 0.5,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT
    );
  `);
  sql.exec(`CREATE INDEX IF NOT EXISTS agent_memory_workspace_idx ON agent_memory (workspace_id, actor);`);
  sql.exec(`
    CREATE TABLE IF NOT EXISTS agent_prefs (
      workspace_id TEXT PRIMARY KEY,
      memory_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `);
  sql.exec(`
    CREATE TABLE IF NOT EXISTS agent_turn_counters (
      workspace_id TEXT PRIMARY KEY,
      turns INTEGER NOT NULL DEFAULT 0
    );
  `);
};

/** Monotonic per-workspace turn counter (drives periodic learning). */
export const bumpTurnCount = (sql: MemorySql, workspaceId: string): number => {
  try {
    sql.exec(
      `INSERT INTO agent_turn_counters (workspace_id, turns) VALUES (?, 1)
       ON CONFLICT (workspace_id) DO UPDATE SET turns = turns + 1`,
      workspaceId,
    );
    const rows = [
      ...sql.exec<{ turns: number }>(`SELECT turns FROM agent_turn_counters WHERE workspace_id = ?`, workspaceId),
    ];
    return rows[0]?.turns ?? 1;
  } catch {
    return 1;
  }
};

export const isMemoryEnabled = (sql: MemorySql, workspaceId: string): boolean => {
  try {
    const rows = [
      ...sql.exec<{ memory_enabled: number | null }>(
        `SELECT memory_enabled FROM agent_prefs WHERE workspace_id = ?`,
        workspaceId,
      ),
    ];
    if (rows.length === 0 || rows[0]!.memory_enabled === null) return true;
    return rows[0]!.memory_enabled !== 0;
  } catch {
    return true;
  }
};

export const setMemoryEnabled = (sql: MemorySql, workspaceId: string, enabled: boolean): void => {
  sql.exec(
    `INSERT INTO agent_prefs (workspace_id, memory_enabled, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT (workspace_id) DO UPDATE SET memory_enabled = excluded.memory_enabled, updated_at = excluded.updated_at`,
    workspaceId,
    enabled ? 1 : 0,
    nowIso(),
  );
};

const normalizeTokens = (text: string): Set<string> =>
  new Set(
    (text ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2),
  );

export const textSimilarity = (a: string, b: string): number => {
  const setA = normalizeTokens(a);
  const setB = normalizeTokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  return intersection / Math.max(setA.size, setB.size);
};

const mapRow = (row: Record<string, unknown>): MemoryItem => ({
  id: String(row['id']),
  workspaceId: String(row['workspace_id']),
  actor: String(row['actor'] ?? ''),
  kind: (row['kind'] as MemoryKind) ?? 'fact',
  content: String(row['content']),
  salience: Number(row['salience'] ?? 0.5),
  createdAt: String(row['created_at']),
  lastSeenAt: String(row['last_seen_at']),
  expiresAt: row['expires_at'] == null ? null : String(row['expires_at']),
});

export type RememberResult =
  | { stored: true; deduped: boolean; item: MemoryItem }
  | { stored: false; reason: 'card_number' | 'empty' | 'disabled' };

export const rememberFact = (
  sql: MemorySql,
  input: {
    workspaceId: string;
    actor: string;
    kind?: MemoryKind;
    content: string;
    salience?: number;
    expiresAt?: string | null;
  },
): RememberResult => {
  const raw = (input.content ?? '').trim();
  if (raw.length === 0) return { stored: false, reason: 'empty' };
  if (containsCardNumber(raw)) return { stored: false, reason: 'card_number' };
  const content = sanitizeMemoryContent(raw);
  if (content.length === 0) return { stored: false, reason: 'empty' };

  // Dedup: same workspace + actor, similar content → bump instead of insert.
  const existing = [
    ...sql.exec<Record<string, unknown>>(
      `SELECT * FROM agent_memory WHERE workspace_id = ? AND actor = ? AND (expires_at IS NULL OR expires_at > ?)`,
      input.workspaceId,
      input.actor,
      nowIso(),
    ),
  ].map(mapRow);
  for (const item of existing) {
    if (textSimilarity(item.content, content) >= MEMORY_SIMILARITY_THRESHOLD) {
      const bumped: MemoryItem = {
        ...item,
        salience: Math.min(1, item.salience + 0.2),
        lastSeenAt: nowIso(),
      };
      sql.exec(`UPDATE agent_memory SET salience = ?, last_seen_at = ? WHERE id = ?`, bumped.salience, bumped.lastSeenAt, item.id);
      return { stored: true, deduped: true, item: bumped };
    }
  }

  const item: MemoryItem = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    actor: input.actor,
    kind: input.kind ?? 'fact',
    content,
    salience: Math.min(1, Math.max(0, input.salience ?? 0.6)),
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
    expiresAt: input.expiresAt ?? null,
  };
  sql.exec(
    `INSERT INTO agent_memory (id, workspace_id, actor, kind, content, salience, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    item.id,
    item.workspaceId,
    item.actor,
    item.kind,
    item.content,
    item.salience,
    item.createdAt,
    item.lastSeenAt,
    item.expiresAt,
  );
  return { stored: true, deduped: false, item };
};

const ageDays = (iso: string): number => {
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 86_400_000 : 0;
};

export const recallMemories = (
  sql: MemorySql,
  input: {
    workspaceId: string;
    actor: string;
    query?: string;
    limit?: number;
    budgetChars?: number;
    includeWorkspaceLevel?: boolean;
  },
): MemoryItem[] => {
  if (!isMemoryEnabled(sql, input.workspaceId)) return [];
  const limit = Math.min(Math.max(input.limit ?? MEMORY_RECALL_LIMIT, 1), 10);
  const budgetChars = input.budgetChars ?? MEMORY_BUDGET_CHARS;
  const includeShared = input.includeWorkspaceLevel !== false;
  const rows = [
    ...sql.exec<Record<string, unknown>>(
      `SELECT * FROM agent_memory WHERE workspace_id = ? AND (expires_at IS NULL OR expires_at > ?)`,
      input.workspaceId,
      nowIso(),
    ),
  ]
    .map(mapRow)
    .filter((item) => item.actor === input.actor || (includeShared && item.actor === ''));
  const queryTokens = normalizeTokens(input.query ?? '');
  const scored = rows.map((item) => {
    const contentTokens = normalizeTokens(item.content);
    let overlap = 0;
    for (const token of queryTokens) if (contentTokens.has(token)) overlap += 1;
    const overlapScore = queryTokens.size > 0 ? overlap / queryTokens.size : 0;
    const score = item.salience * Math.exp(-ageDays(item.lastSeenAt) / 180) + overlapScore * 0.5;
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked: MemoryItem[] = [];
  let chars = 0;
  for (const { item } of scored.slice(0, limit)) {
    if (chars + item.content.length > budgetChars && picked.length > 0) break;
    picked.push(item);
    chars += item.content.length;
  }
  // Touch on recall (recency without inflating salience).
  for (const item of picked) {
    try {
      sql.exec(`UPDATE agent_memory SET last_seen_at = ? WHERE id = ?`, nowIso(), item.id);
    } catch {
      // Best effort.
    }
  }
  return picked;
};

/** Compact `MEMÓRIA DO USUÁRIO` block for system-prompt injection. */
export const renderMemoryBlock = (items: MemoryItem[]): string | null => {
  if (items.length === 0) return null;
  return items.map((item) => `- ${item.content}`).join('\n');
};
