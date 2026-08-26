import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { AuthError } from '../../src/auth/device-token.js';
import { requireAuthenticatedRequest } from '../../src/auth/request-context.js';

describe('authenticated request context', () => {
  it('returns mandatory device context and token', () => {
    const request = {
      authenticatedContext: { householdId: 'household-1', actorId: 'device-1', actorType: 'device', deviceId: 'device-1' },
      deviceToken: 'token-1',
    } as FastifyRequest;

    expect(requireAuthenticatedRequest(request)).toMatchObject({
      authenticatedContext: { householdId: 'household-1', actorId: 'device-1', actorType: 'device', deviceId: 'device-1' },
      deviceToken: 'token-1',
    });
  });

  it('rejects a request without the pre-handler context', () => {
    expect(() => requireAuthenticatedRequest({} as FastifyRequest)).toThrowError(
      expect.objectContaining({ code: 'auth.context_missing', statusCode: 500 } satisfies Partial<AuthError>),
    );
  });
});
