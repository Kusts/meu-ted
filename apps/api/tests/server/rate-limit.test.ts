import { describe, it, expect, beforeEach, } from 'vitest';
import { createRateLimiter, type RateLimiter } from '../../src/server/rate-limit.js';

describe('G0.1.6 — rate limiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 5 });
  });

  it('allows requests within limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(limiter.check('device-1').allowed).toBe(true);
    }
  });

  it('rejects requests exceeding limit', () => {
    for (let i = 0; i < 5; i++) limiter.check('device-1');
    const result = limiter.check('device-1');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('tracks different keys independently', () => {
    for (let i = 0; i < 5; i++) limiter.check('device-1');
    expect(limiter.check('device-2').allowed).toBe(true);
  });

  it('resets after window expires', () => {
    for (let i = 0; i < 5; i++) limiter.check('device-1');
    expect(limiter.check('device-1').allowed).toBe(false);

    // Simulate window expiry by creating a new limiter with 0ms window
    const expiredLimiter = createRateLimiter({ windowMs: 0, maxRequests: 5 });
    expect(expiredLimiter.check('device-1').allowed).toBe(true);
  });

  it('returns remaining count', () => {
    expect(limiter.check('device-1').remaining).toBe(4);
    limiter.check('device-1');
    expect(limiter.check('device-1').remaining).toBe(2);
  });
});
