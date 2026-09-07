/**
 * Worker-local memory tools (Part B, item 15): remember_fact, recall,
 * list_past_sessions, get_session_summary. Unlike the generated HTTP tools,
 * these run against the DO SQLite database directly — same workspace/actor
 * isolation, no network. Wired into the model via `buildExposedTools`
 * `extraTools` (see agent-config/tools.ts).
 */

import { tool, jsonSchema } from 'ai';
import { listPastSessions, getSessionSummary } from './sessions.js';
import { recallMemories, rememberFact, type MemorySql } from './store.js';

export type MemoryToolContext = {
  sql: MemorySql;
  workspaceId: string;
  actorId: string;
};

export const buildMemoryTools = (ctx: MemoryToolContext): Record<string, ReturnType<typeof tool>> => ({
  remember_fact: tool({
    description: 'Guarda um fato, preferência ou aprendizado durável sobre a pessoa (com o consentimento implícito do pedido).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        content: { type: 'string', minLength: 1, maxLength: 500 },
        kind: { type: 'string', enum: ['fact', 'preference', 'learning'] },
      },
      required: ['content'],
    }),
    execute: async (params: Record<string, unknown>) => {
      const result = rememberFact(ctx.sql, {
        workspaceId: ctx.workspaceId,
        actor: ctx.actorId,
        kind: (params.kind as 'fact' | 'preference' | 'learning' | undefined) ?? 'fact',
        content: String(params.content ?? ''),
      });
      if (!result.stored) {
        return { stored: false, reason: result.reason, message: 'Não guardei isso (conteúdo vazio ou sensível).' };
      }
      return {
        stored: true,
        deduped: result.deduped,
        message: result.deduped ? 'Isso reforça algo que eu já sabia.' : 'Memorizado.',
      };
    },
  }),

  recall: tool({
    description: 'Busca na memória do workspace por fatos e aprendizados (palavras-chave, recência e relevância).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 300 },
        limit: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['query'],
    }),
    execute: async (params: Record<string, unknown>) => {
      const items = recallMemories(ctx.sql, {
        workspaceId: ctx.workspaceId,
        actor: ctx.actorId,
        query: String(params.query ?? ''),
        limit: typeof params.limit === 'number' ? params.limit : 5,
      });
      return {
        found: items.length,
        memories: items.map((item) => ({ kind: item.kind, content: item.content })),
      };
    },
  }),

  list_past_sessions: tool({
    description: 'Lista sessões de conversa anteriores encerradas deste workspace.',
    inputSchema: jsonSchema({ type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 20 } } }),
    execute: async (params: Record<string, unknown>) => {
      const sessions = listPastSessions(
        ctx.sql,
        ctx.workspaceId,
        ctx.actorId,
        typeof params.limit === 'number' ? params.limit : 5,
      );
      return {
        found: sessions.length,
        sessions: sessions.map((session) => ({
          sessionId: session.id,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          messageCount: session.messageCount,
          summary: session.summary,
        })),
      };
    },
  }),

  get_session_summary: tool({
    description: 'Lê o resumo de uma sessão anterior específica (por sessionId).',
    inputSchema: jsonSchema({
      type: 'object',
      properties: { sessionId: { type: 'string', minLength: 1, maxLength: 128 } },
      required: ['sessionId'],
    }),
    execute: async (params: Record<string, unknown>) => {
      const session = getSessionSummary(ctx.sql, ctx.workspaceId, ctx.actorId, String(params.sessionId ?? ''));
      if (!session) return { found: false, message: 'Sessão não encontrada neste workspace.' };
      return {
        found: true,
        sessionId: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        messageCount: session.messageCount,
        summary: session.summary,
      };
    },
  }),
});

export const MEMORY_TOOL_NAMES: readonly string[] = ['remember_fact', 'recall', 'list_past_sessions', 'get_session_summary'];
