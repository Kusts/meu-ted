import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A } from '../test-app.js';

const auth = (token: string) => ({ 'x-device-token': token });

describe('POST /client-events (FIX-F0, SPEC §24 client transport)', () => {
  it('accepts mic.error dimensions and returns 204', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/client-events',
      headers: auth(TOKEN_A),
      payload: {
        eventType: 'mic.error',
        payload: { reason: 'denied', capability: 'on' },
      },
    });
    expect(response.statusCode).toBe(204);
  });

  it('accepts offline.locked dimensions and returns 204', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/client-events',
      headers: auth(TOKEN_A),
      payload: {
        eventType: 'offline.locked',
        payload: { offlineSubjectId: 'subject-1', ageBand: 'over-24h' },
      },
    });
    expect(response.statusCode).toBe(204);
  });

  it('rejects invalid payloads with 400 (contract T0.4)', async () => {
    const { app } = buildTestApp();
    const badReason = await app.inject({
      method: 'POST',
      url: '/client-events',
      headers: auth(TOKEN_A),
      payload: { eventType: 'mic.error', payload: { reason: 'exploded', capability: 'on' } },
    });
    expect(badReason.statusCode).toBe(400);

    const unknownField = await app.inject({
      method: 'POST',
      url: '/client-events',
      headers: auth(TOKEN_A),
      payload: { eventType: 'mic.error', payload: { reason: 'denied', capability: 'on', extra: 1 } },
    });
    expect(unknownField.statusCode).toBe(400);

    const blockedEvent = await app.inject({
      method: 'POST',
      url: '/client-events',
      headers: auth(TOKEN_A),
      payload: { eventType: 'csp.violation', payload: { effectiveDirective: 'x', blockedHost: 'y' } },
    });
    expect(blockedEvent.statusCode).toBe(400);

    const secret = await app.inject({
      method: 'POST',
      url: '/client-events',
      headers: auth(TOKEN_A),
      payload: { eventType: 'mic.error', payload: { reason: 'denied', capability: 'on', password: 'x' } },
    });
    expect(secret.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/client-events',
      payload: { eventType: 'mic.error', payload: { reason: 'denied', capability: 'on' } },
    });
    expect(response.statusCode).toBe(401);
  });
});
