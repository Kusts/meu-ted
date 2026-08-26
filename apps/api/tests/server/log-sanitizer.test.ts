import { describe, it, expect } from 'vitest';
import { sanitizeHeaders, sanitizeLogData } from '../../src/server/log-sanitizer.js';

describe('G0.1.6 — log sanitizer', () => {
  it('redacts x-device-token header', () => {
    const headers = {
      'content-type': 'application/json',
      'x-device-token': 'secret-token-123',
      'accept': 'application/json',
    };
    const result = sanitizeHeaders(headers);
    expect(result['x-device-token']).toBe('[REDACTED]');
    expect(result['content-type']).toBe('application/json');
  });

  it('handles missing x-device-token', () => {
    const headers = { 'content-type': 'application/json' };
    const result = sanitizeHeaders(headers);
    expect(result['content-type']).toBe('application/json');
    expect(result['x-device-token']).toBeUndefined();
  });

  it('redacts token in nested objects', () => {
    const data = {
      request: {
        headers: { 'x-device-token': 'token-abc' },
        body: { amount: 100 },
      },
    };
    const result = sanitizeLogData(data) as any;
    expect(result.request.headers['x-device-token']).toBe('[REDACTED]');
    expect(result.request.body.amount).toBe(100);
  });

  it('redacts authorization header if present', () => {
    const headers = {
      'authorization': 'Bearer abc123',
      'x-device-token': 'tok',
    };
    const result = sanitizeHeaders(headers);
    expect(result['authorization']).toBe('[REDACTED]');
  });
});
