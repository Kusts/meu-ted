import { describe, expect, it } from 'vitest';
import { createSanitizedEvent, classifyError } from '../../src/observability/events.js';

describe('TED V2 sanitized observability RED', () => {
  it('emits an allowlisted event without raw payload, financial values or technical IDs', () => {
    const event = createSanitizedEvent('turn.failed', {
      workspaceId: 'ws-secret-id', turnId: 'turn-secret-id',
      payload: { balance: 123.45, token: 'secret-token', nested: { id: 'db-id' } },
      error: new Error('password=hunter2'),
    });
    expect(JSON.stringify(event)).not.toMatch(/123\.45|hunter2|secret-token|ws-secret-id|turn-secret-id|db-id/);
    expect(event.eventType).toBe('turn.failed');
  });

  it('classifies errors deterministically', () => {
    expect(classifyError(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))).toBe('timeout');
    expect(classifyError(new Error('anything else'))).toBe('unknown');
  });
});
