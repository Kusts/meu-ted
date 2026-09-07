/**
 * Session compaction (Part B, item 15): when the model context exceeds
 * COMPACT_THRESHOLD_MESSAGES, the oldest turns are summarized into ONE
 * `summary` memory and replaced in the context sent to the model. The full
 * stored history is NEVER deleted by compaction (only "Nova sessão"
 * clears it, archiving a registry row first).
 *
 * The summarizer is injected: production passes a cheap active-model call,
 * tests and degraded paths fall back to silent extractive truncation.
 */

export type ContextTurn = { role: 'user' | 'assistant'; content: string };

export const COMPACT_THRESHOLD_MESSAGES = 40;
export const COMPACT_KEEP_RECENT = 10;
export const COMPACT_SUMMARY_MAX_CHARS = 600;

export type SummarizeFn = (turns: ContextTurn[]) => Promise<string>;

export const extractiveSummary = (turns: ContextTurn[], maxChars = COMPACT_SUMMARY_MAX_CHARS): string => {
  const userTexts = turns.filter((turn) => turn.role === 'user').map((turn) => turn.content.trim()).filter(Boolean);
  const picked = userTexts.slice(0, 3);
  const joined = picked.join(' | ');
  const truncated = joined.length > maxChars ? `${joined.slice(0, maxChars)}…` : joined;
  return `[Resumo automático] Assuntos tratados: ${truncated || 'conversa geral'}.`;
};

export const toContextTurns = (messages: Array<{ role?: string; content?: string }>): ContextTurn[] =>
  (messages ?? [])
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && (message.content ?? '').trim() !== '')
    .map((message) => ({ role: message.role as 'user' | 'assistant', content: (message.content ?? '').trim() }));

export type CompactionResult = {
  /** Messages actually sent to the model (summaries + recent turns). */
  context: ContextTurn[];
  compacted: boolean;
  /** Fresh summary text when compaction ran (persist as kind=summary). */
  summary: string | null;
  /** Turns replaced by the summary (for observability, never secrets). */
  replacedCount: number;
};

export const compactContext = async (
  turns: ContextTurn[],
  opts?: { summarize?: SummarizeFn; threshold?: number; keepRecent?: number },
): Promise<CompactionResult> => {
  const threshold = opts?.threshold ?? COMPACT_THRESHOLD_MESSAGES;
  const keepRecent = opts?.keepRecent ?? COMPACT_KEEP_RECENT;
  if (turns.length <= threshold) {
    return { context: turns, compacted: false, summary: null, replacedCount: 0 };
  }
  const old = turns.slice(0, Math.max(0, turns.length - keepRecent));
  const recent = turns.slice(Math.max(0, turns.length - keepRecent));
  let summary: string;
  try {
    summary = opts?.summarize ? await opts.summarize(old) : extractiveSummary(old);
  } catch {
    // Silent fallback: never break the turn when the LLM summarizer fails.
    summary = extractiveSummary(old);
  }
  if (!summary || summary.trim() === '') summary = extractiveSummary(old);
  return {
    context: [{ role: 'assistant', content: `[Resumo de conversas anteriores]\n${summary}` }, ...recent],
    compacted: true,
    summary,
    replacedCount: old.length,
  };
};
