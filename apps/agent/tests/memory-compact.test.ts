import { describe, expect, it, vi } from 'vitest';
import {
  COMPACT_KEEP_RECENT,
  COMPACT_THRESHOLD_MESSAGES,
  compactContext,
  extractiveSummary,
  toContextTurns,
  type ContextTurn,
} from '../src/agent-config/memory/compact.js';

const makeTurns = (n: number): ContextTurn[] =>
  Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `mensagem ${i + 1} sobre orçamento familiar`,
  }));

describe('session compaction (Part B)', () => {
  it('passes short histories through untouched', async () => {
    const turns = makeTurns(10);
    const result = await compactContext(turns);
    expect(result.compacted).toBe(false);
    expect(result.context).toEqual(turns);
    expect(result.summary).toBeNull();
  });

  it('replaces old turns with one summary keeping recent ones', async () => {
    const turns = makeTurns(COMPACT_THRESHOLD_MESSAGES + 5);
    const result = await compactContext(turns, { summarize: async () => 'resumo via modelo' });
    expect(result.compacted).toBe(true);
    expect(result.summary).toBe('resumo via modelo');
    expect(result.replacedCount).toBe(turns.length - COMPACT_KEEP_RECENT);
    expect(result.context).toHaveLength(COMPACT_KEEP_RECENT + 1);
    expect(result.context[0]).toMatchObject({ role: 'assistant' });
    expect(result.context[0]!.content).toContain('resumo via modelo');
    // Recent turns preserved verbatim at the tail.
    expect(result.context[result.context.length - 1]).toEqual(turns[turns.length - 1]);
  });

  it('falls back to silent extractive truncation when the LLM fails', async () => {
    const turns = makeTurns(COMPACT_THRESHOLD_MESSAGES + 1);
    const result = await compactContext(turns, {
      summarize: async () => {
        throw new Error('provider 500');
      },
    });
    expect(result.compacted).toBe(true);
    expect(result.summary).toContain('Resumo automático');
    expect(result.context[0]!.content).toContain('mensagem 1');
  });

  it('extractive summary mentions user topics and caps length', () => {
    const summary = extractiveSummary(makeTurns(30), 80);
    expect(summary).toContain('mensagem 1');
    expect(summary.length).toBeLessThan(250);
  });

  it('converts SDK-shaped messages filtering empties', () => {
    expect(
      toContextTurns([
        { role: 'user', content: '  oi  ' },
        { role: 'system', content: 'ignorado' },
        { role: 'assistant', content: '' },
      ]),
    ).toEqual([{ role: 'user', content: 'oi' }]);
  });

  it('coherence: pre-compaction content stays answerable via the summary', async () => {
    const turns: ContextTurn[] = [
      { role: 'user', content: 'Minha conta principal é o Nubank' },
      ...makeTurns(COMPACT_THRESHOLD_MESSAGES),
    ];
    const summarize = vi.fn(async () => 'A pessoa usa Nubank como conta principal.');
    const result = await compactContext(turns, { summarize });
    expect(summarize).toHaveBeenCalledTimes(1);
    const contextText = result.context.map((turn) => turn.content).join('\n');
    expect(contextText).toContain('Nubank');
  });
});
