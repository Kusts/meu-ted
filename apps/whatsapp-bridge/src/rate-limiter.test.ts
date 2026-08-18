// ─────────────────────────────────────────────────────────────────────────────
// Rate limiter tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter, type RateLimiter } from './rate-limiter.js';

describe('rate-limiter', () => {
  let limiter: RateLimiter;
  const windowMs = 1000; // 1s window for fast tests
  const max = 3;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = createRateLimiter({ windowMs, max });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('allow', () => {
    it('allows up to max requests in the window', () => {
      expect(limiter.allow('127.0.0.1')).toBe(true);
      expect(limiter.allow('127.0.0.1')).toBe(true);
      expect(limiter.allow('127.0.0.1')).toBe(true);
    });

    it('rejects when exceeding max in the window', () => {
      limiter.allow('127.0.0.1');
      limiter.allow('127.0.0.1');
      limiter.allow('127.0.0.1');
      expect(limiter.allow('127.0.0.1')).toBe(false);
    });

    it('allows again after window expires', () => {
      limiter.allow('127.0.0.1');
      limiter.allow('127.0.0.1');
      limiter.allow('127.0.0.1');
      expect(limiter.allow('127.0.0.1')).toBe(false);

      // Advance past window
      vi.advanceTimersByTime(windowMs + 1);

      expect(limiter.allow('127.0.0.1')).toBe(true);
    });

    it('tracks different keys independently', () => {
      // Exhaust key A
      limiter.allow('192.168.1.1');
      limiter.allow('192.168.1.1');
      limiter.allow('192.168.1.1');
      expect(limiter.allow('192.168.1.1')).toBe(false);

      // Key B is unaffected
      expect(limiter.allow('10.0.0.1')).toBe(true);
      expect(limiter.allow('10.0.0.1')).toBe(true);
    });

    it('returns retryAfterMs as 0 when allowed', () => {
      const result = limiter.info('127.0.0.1');
      expect(result.remaining).toBe(max);
      expect(result.resetMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('info', () => {
    it('returns remaining count and reset time', () => {
      limiter.allow('10.0.0.55');
      const info = limiter.info('10.0.0.55');
      expect(info.remaining).toBe(max - 1);
      expect(info.resetMs).toBeGreaterThan(0);
      expect(info.resetMs).toBeLessThanOrEqual(windowMs);
    });

    it('returns 0 remaining when exhausted', () => {
      limiter.allow('10.0.0.55');
      limiter.allow('10.0.0.55');
      limiter.allow('10.0.0.55');
      const info = limiter.info('10.0.0.55');
      expect(info.remaining).toBe(0);
    });

    it('returns 0 resetMs when no entries exist (no timer running)', () => {
      const info = limiter.info('10.0.0.99');
      expect(info.remaining).toBe(max);
      expect(info.resetMs).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('removes expired entries automatically', () => {
      limiter.allow('1.1.1.1');
      limiter.allow('1.1.1.1');
      limiter.allow('1.1.1.1');

      // Advance well past window + cleanup threshold
      vi.advanceTimersByTime(windowMs * 2 + 1);

      // After cleanup, should be fresh
      expect(limiter.allow('1.1.1.1')).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears all entries for a key', () => {
      limiter.allow('5.5.5.5');
      limiter.allow('5.5.5.5');
      limiter.allow('5.5.5.5');
      expect(limiter.allow('5.5.5.5')).toBe(false);

      limiter.reset('5.5.5.5');
      expect(limiter.allow('5.5.5.5')).toBe(true);
    });
  });
});
