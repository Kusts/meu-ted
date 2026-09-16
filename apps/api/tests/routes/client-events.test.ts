import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import { HOUSEHOLD_A, HOUSEHOLD_B } from '../fixtures/seed.js';

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
        payload: { offlineSubjectId: HOUSEHOLD_A, ageBand: '1-7d' },
      },
    });
    expect(response.statusCode).toBe(204);
  });

  it('FIX-F1 rejects non-UUID subject, session mismatch, and open ageBand', async () => {
    const { app } = buildTestApp();
    const nonUuid = await app.inject({
      method: 'POST',
      url: '/client-events',
      headers: auth(TOKEN_A),
      payload: {
        eventType: 'offline.locked',
        payload: { offlineSubjectId: 'subject-1', ageBand: '1-7d' },
      },
    });
    expect(nonUuid.statusCode).toBe(400);

    const mismatch = await app.inject({
      method: 'POST',
      url: '/client-events',
      headers: auth(TOKEN_A),
      payload: {
        eventType: 'offline.locked',
        payload: { offlineSubjectId: HOUSEHOLD_B, ageBand: '1-7d' },
      },
    });
    expect(mismatch.statusCode).toBe(400);

    const openBand = await app.inject({
      method: 'POST',
      url: '/client-events',
      headers: auth(TOKEN_A),
      payload: {
        eventType: 'offline.locked',
        payload: { offlineSubjectId: HOUSEHOLD_A, ageBand: 'over-24h' },
      },
    });
    expect(openBand.statusCode).toBe(400);

    // Sanity: the other household accepts its own subject (binding is per-session).
    const ownSubject = await app.inject({
      method: 'POST',
      url: '/client-events',
      headers: auth(TOKEN_B),
      payload: {
        eventType: 'offline.locked',
        payload: { offlineSubjectId: HOUSEHOLD_B, ageBand: '>30d' },
      },
    });
    expect(ownSubject.statusCode).toBe(204);
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
