import { describe, expect, it } from 'vitest';
import {
  OBSERVABILITY_EVENT_TYPES,
  buildObservabilityEvent,
} from '../../src/audit/events.js';

describe('V4 observability contract (SPEC §24)', () => {
  it('exposes the 8 canonical event types', () => {
    expect([...OBSERVABILITY_EVENT_TYPES].sort()).toEqual(
      [
        'agent.workspace.legacy_access',
        'audit-undo.replay',
        'auth.request.legacy_bearer_used',
        'csp.violation',
        'device.tokens.legacy_active',
        'mic.error',
        'mutation.reconcile.enqueued',
        'offline.locked',
      ].sort(),
    );
  });

  it('accepts a clean payload for each audit_logs-backed counter', () => {
    expect(
      buildObservabilityEvent('auth.request.legacy_bearer_used', {
        workspaceId: '00000000-0000-4000-8000-0000000000a1',
      }),
    ).toMatchObject({ eventType: 'auth.request.legacy_bearer_used' });
    expect(
      buildObservabilityEvent('audit-undo.replay', {
        workspaceId: '00000000-0000-4000-8000-0000000000a1',
      }),
    ).toMatchObject({ eventType: 'audit-undo.replay' });
    expect(
      buildObservabilityEvent('mutation.reconcile.enqueued', {
        workspaceId: '00000000-0000-4000-8000-0000000000a1',
        operationId: '00000000-0000-4000-8000-0000000000b2',
        reason: 'replay-after-restart',
      }),
    ).toMatchObject({ eventType: 'mutation.reconcile.enqueued' });
  });

  it('reduces blockedURL to its host without query or path', () => {
    const event = buildObservabilityEvent('csp.violation', {
      effectiveDirective: 'connect-src',
      blockedURL: 'https://api.synkroo.com.br/v1/accounts?token=abc&next=/x',
      disposition: 'enforce',
      statusCode: 200,
    });
    expect(event.payload).toMatchObject({
      effectiveDirective: 'connect-src',
      blockedHost: 'api.synkroo.com.br',
    });
    expect(JSON.stringify(event.payload)).not.toContain('token=abc');
    expect(JSON.stringify(event.payload)).not.toContain('/v1/accounts');
  });

  it('rejects a password anywhere in the payload', () => {
    expect(() =>
      buildObservabilityEvent('mic.error', {
        reason: 'denied',
        capability: 'on',
        password: 'supersecret',
      }),
    ).toThrow(/password/i);
  });

  it('rejects JWT-shaped bearer strings', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c';
    expect(() =>
      buildObservabilityEvent('audit-undo.replay', {
        workspaceId: '00000000-0000-4000-8000-0000000000a1',
        proof: jwt,
      }),
    ).toThrow(/token/i);
  });

  it('rejects Bearer-scheme credential strings', () => {
    expect(() =>
      buildObservabilityEvent('audit-undo.replay', {
        workspaceId: '00000000-0000-4000-8000-0000000000a1',
        authHeader: 'Bearer abcdefgh12345678',
      }),
    ).toThrow(/token|bearer|credential/i);
  });

  it('rejects raw device tokens by key', () => {
    expect(() =>
      buildObservabilityEvent('device.tokens.legacy_active', {
        legacyCount: 3,
        deviceToken: 'tok_abcdef1234567890',
      }),
    ).toThrow(/device token/i);
  });

  it('rejects raw cookie values by key', () => {
    expect(() =>
      buildObservabilityEvent('auth.request.legacy_bearer_used', {
        workspaceId: '00000000-0000-4000-8000-0000000000a1',
        cookie: 'session=abc123; Path=/; HttpOnly',
      }),
    ).toThrow(/cookie/i);
    expect(() =>
      buildObservabilityEvent('auth.request.legacy_bearer_used', {
        workspaceId: '00000000-0000-4000-8000-0000000000a1',
        'set-cookie': 'session=abc123; Path=/; HttpOnly',
      }),
    ).toThrow(/cookie/i);
  });

  it('rejects attestation material', () => {
    expect(() =>
      buildObservabilityEvent('mutation.reconcile.enqueued', {
        workspaceId: '00000000-0000-4000-8000-0000000000a1',
        operationId: '00000000-0000-4000-8000-0000000000b2',
        reason: 'replay-after-restart',
        attestation: { hash: 'deadbeef' },
      }),
    ).toThrow(/attestation/i);
  });

  it('rejects a complete financial payload', () => {
    expect(() =>
      buildObservabilityEvent('audit-undo.replay', {
        workspaceId: '00000000-0000-4000-8000-0000000000a1',
        transaction: { amount: 1999, description: 'Mercado' },
      }),
    ).toThrow(/financial/i);
  });

  it('requires workspaceId where the audit_logs table demands it', () => {
    expect(() => buildObservabilityEvent('auth.request.legacy_bearer_used', {})).toThrow(
      /workspaceId/i,
    );
    expect(() => buildObservabilityEvent('audit-undo.replay', {})).toThrow(/workspaceId/i);
    expect(() =>
      buildObservabilityEvent('mutation.reconcile.enqueued', {
        operationId: '00000000-0000-4000-8000-0000000000b2',
        reason: 'replay-after-restart',
      }),
    ).toThrow(/workspaceId/i);
  });

  it('requires offline.locked dimensions (offlineSubjectId + age band)', () => {
    expect(() => buildObservabilityEvent('offline.locked', {})).toThrow(/offlineSubjectId/i);
    expect(() =>
      buildObservabilityEvent('offline.locked', { offlineSubjectId: 'subject-1' }),
    ).toThrow(/ageBand/i);
    expect(
      buildObservabilityEvent('offline.locked', {
        offlineSubjectId: 'subject-1',
        ageBand: 'over-24h',
      }),
    ).toMatchObject({ eventType: 'offline.locked' });
  });

  it('requires mic.error reason code and capability flag', () => {
    expect(() => buildObservabilityEvent('mic.error', { reason: 'denied' })).toThrow(
      /capability/i,
    );
    expect(() =>
      buildObservabilityEvent('mic.error', { reason: 'exploded', capability: 'on' }),
    ).toThrow(/reason/i);
    expect(
      buildObservabilityEvent('mic.error', { reason: 'denied', capability: 'on' }),
    ).toMatchObject({ eventType: 'mic.error' });
  });

  it('requires mutation.reconcile.enqueued operationId and reason', () => {
    expect(() =>
      buildObservabilityEvent('mutation.reconcile.enqueued', {
        workspaceId: '00000000-0000-4000-8000-0000000000a1',
        reason: 'replay-after-restart',
      }),
    ).toThrow(/operationId/i);
  });
});
