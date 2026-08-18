import { describe, expect, it } from 'vitest';
import { pendingIdentitySchema } from '../../src/routes/pending-operations.js';

describe('pending identity schema', () => {
  it('accepts the canonical pending operation id', () => {
    expect(pendingIdentitySchema.safeParse({ pendingOperationId: '11111111-1111-4111-8111-111111111111' }).success).toBe(true);
  });

  it('accepts the temporary legacy chat id', () => {
    expect(pendingIdentitySchema.safeParse({ chatId: 'chat-123' }).success).toBe(true);
  });

  it('requires exactly one identity', () => {
    expect(pendingIdentitySchema.safeParse({}).success).toBe(false);
    expect(pendingIdentitySchema.safeParse({
      pendingOperationId: '11111111-1111-4111-8111-111111111111',
      chatId: 'chat-123',
    }).success).toBe(false);
  });
});
