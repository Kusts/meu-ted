/**
 * Post-turn learning (Part B, item 15): lightweight extraction of 0–2
 * durable learnings per turn (preferred account, recurring categories,
 * cited goals, format preferences).
 *
 * - Runs every turn with a cheap local heuristic; an optional LLM
 *   extractor runs only every LEARN_EVERY_TURNS turns.
 * - Dedup by token similarity (bump instead of insert); salience decays
 *   via recall-time recency weighting (see store.ts).
 * - Respects the per-workspace privacy toggle and redacts transcripts
 *   before persisting. Card numbers are never stored.
 */

import { isMemoryEnabled, rememberFact, textSimilarity, type MemoryItem, type MemorySql } from './store.js';

export const LEARN_EVERY_TURNS = 5;
export const MAX_LEARNINGS_PER_TURN = 2;
export const LEARN_DEDUP_THRESHOLD = 0.6;

export type LearningCandidate = {
  kind: 'preference' | 'fact' | 'learning';
  content: string;
  salience: number;
};

const HEURISTIC_PATTERNS: Array<{ test: RegExp; kind: LearningCandidate['kind']; salience: number }> = [
  { test: /prefiro|prefere|gosto mais|sempre uso/i, kind: 'preference', salience: 0.8 },
  { test: /lembre[ -]se|não esqueça|nao esqueca| memorize|guarde (isso|esta)/i, kind: 'preference', salience: 0.9 },
  { test: /minha (conta|meta|categoria).+ é |meu (banco|cartão|cartao|limite) é /i, kind: 'fact', salience: 0.7 },
  { test: /todo (mês|mes|dia|semana|ano) (eu )?/i, kind: 'learning', salience: 0.6 },
];

export const extractLearningsHeuristic = (userText: string, _assistantText: string): LearningCandidate[] => {
  const found: LearningCandidate[] = [];
  for (const pattern of HEURISTIC_PATTERNS) {
    if (pattern.test.test(userText)) {
      const content = userText.trim().slice(0, 280);
      if (content.length > 0) found.push({ kind: pattern.kind, content, salience: pattern.salience });
    }
    if (found.length >= MAX_LEARNINGS_PER_TURN) break;
  }
  return found.slice(0, MAX_LEARNINGS_PER_TURN);
};

export const isDuplicateLearning = (candidate: string, existing: MemoryItem[]): boolean =>
  existing.some((item) => textSimilarity(item.content, candidate) >= LEARN_DEDUP_THRESHOLD);

export type LearnTurnInput = {
  workspaceId: string;
  actorId: string;
  userText: string;
  assistantText: string;
  turnCount: number;
  /** Optional cheap-LLM extractor used only when the turn is due. */
  llmExtract?: (transcript: string) => Promise<string[]>;
};

export const learnFromTurn = async (sql: MemorySql, input: LearnTurnInput): Promise<MemoryItem[]> => {
  if (!isMemoryEnabled(sql, input.workspaceId)) return [];
  // A failed/empty assistant turn is not an actual response and must not
  // teach durable memory from an uncompleted interaction.
  if (typeof input.assistantText !== 'string' || input.assistantText.trim().length === 0) return [];
  const learned: MemoryItem[] = [];
  const persist = (candidate: LearningCandidate): void => {
    const result = rememberFact(sql, {
      workspaceId: input.workspaceId,
      actor: input.actorId,
      kind: candidate.kind,
      content: candidate.content,
      salience: candidate.salience,
    });
    if (result.stored && !result.deduped) learned.push(result.item);
  };

  for (const candidate of extractLearningsHeuristic(input.userText, input.assistantText)) {
    if (learned.length >= MAX_LEARNINGS_PER_TURN) break;
    persist(candidate);
  }

  if (input.llmExtract && input.turnCount > 0 && input.turnCount % LEARN_EVERY_TURNS === 0) {
    try {
      const extra = await input.llmExtract(`Usuário: ${input.userText}\nTED: ${input.assistantText}`);
      for (const content of (extra ?? []).slice(0, MAX_LEARNINGS_PER_TURN - learned.length)) {
        if (typeof content === 'string' && content.trim().length > 0) {
          persist({ kind: 'learning', content: content.trim().slice(0, 280), salience: 0.6 });
        }
      }
    } catch {
      // Silent: learning must never break the turn.
    }
  }
  return learned;
};
