import { describe, expect, it } from 'vitest';
import { CodexRuntimeAdapter } from '../src/runtime-adapter.js';

describe('Codex Runtime Adapter Integration (Task 5A)', () => {
  const adapter = new CodexRuntimeAdapter();

  it('validates allowlisted models', () => {
    expect(adapter.isModelAllowed('gpt-4o')).toBe(true);
    expect(adapter.isModelAllowed('gpt-4o-mini')).toBe(true);
    expect(adapter.isModelAllowed('o3-mini')).toBe(true);
    expect(adapter.isModelAllowed('claude-3-5-sonnet')).toBe(false);
    expect(adapter.isModelAllowed('arbitrary-model')).toBe(false);
  });

  it('rejects execution when reauth is required', async () => {
    await expect(
      adapter.executeCompletion(
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'Test' }],
          requestId: 'req-1',
          intentionId: 'intent-1',
          workspaceId: 'ws-1',
          actorId: 'u-1',
        },
        { authenticated: false, reauthRequired: true },
      ),
    ).rejects.toThrow('codex_reauth_required');
  });

  it('cancels ongoing execution by requestId', async () => {
    const cancelled = adapter.cancelExecution('non-existent-req');
    expect(cancelled).toBe(false);
  });
});
